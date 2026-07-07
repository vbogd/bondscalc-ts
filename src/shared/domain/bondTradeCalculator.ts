import Decimal from "decimal.js";
import { xirr } from "@webcarrot/xirr";
import type { LocalDate } from "../api/moex";

export type BondCashFlow = {
  date: LocalDate;
  amount: number;
};

export type BondAmortization = BondCashFlow & {
  nominalReductionAmount?: number;
};

export type BondTradeInput = {
  currentNominal: number;
  buyPricePercent: number;
  exitPricePercent: number;
  buyDate: LocalDate;
  exitDate: LocalDate;
  buyAccruedInterest: number;
  commissionPercent: number;
  exitCommissionPercent: number;
  taxPercent: number;
  couponAnnualPercent?: number | null;
  couponValue?: number | null;
  couponPeriodDays?: number | null;
  coupons?: BondCashFlow[];
  amortizations?: BondAmortization[];
};

export type BondTradeResult = {
  holdingDays: number;
  buyCleanAmount: number;
  buyAccruedInterest: number;
  buyCommission: number;
  totalPaid: number;
  exitCleanAmount: number;
  exitAccruedInterest: number;
  exitCommission: number;
  couponsReceived: number;
  amortizationsReceived: number;
  totalReceived: number;
  profitBeforeTax: number;
  taxableProfit: number;
  tax: number;
  profitAfterTax: number;
  dealReturnPercent: number | null;
  annualizedXirrPercent: number | null;
  annualizedReturnPercent: number | null;
  couponEffect: number;
  nominalAtExit: number;
  warnings: string[];
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function calculateBondTrade(input: BondTradeInput): BondTradeResult {
  const holdingDays = getDaysBetween(input.buyDate, input.exitDate);
  const effectiveHoldingDays = Math.max(holdingDays ?? 0, 0);
  const currentNominal = toDecimal(input.currentNominal);
  const buyCleanAmount = percentOf(currentNominal, input.buyPricePercent);
  const buyAccruedInterest = toDecimal(input.buyAccruedInterest);
  const buyCommission = percentOf(buyCleanAmount, input.commissionPercent);
  const totalPaid = buyCleanAmount.plus(buyAccruedInterest).plus(buyCommission);
  const amortizations = getCashFlowsInsidePeriod(
    input.amortizations ?? [],
    input.buyDate,
    input.exitDate,
  );
  const amortizationsReceived = sumCashFlows(amortizations);
  const nominalReduction = sumDecimals(
    amortizations.map((amortization) =>
      toDecimal(amortization.nominalReductionAmount ?? amortization.amount),
    ),
  );
  const nominalAtExit = Decimal.max(currentNominal.minus(nominalReduction), 0);
  const exitCleanAmount = percentOf(nominalAtExit, input.exitPricePercent);
  const exitCommission = percentOf(exitCleanAmount, input.exitCommissionPercent);
  const dailyCouponAccrual = getDailyCouponAccrual(input);
  const couponAccrual = calculateCouponAccrual({
    buyAccruedInterest,
    buyDate: input.buyDate,
    exitDate: input.exitDate,
    dailyCouponAccrual,
    coupons: input.coupons ?? [],
  });
  const totalReceived = exitCleanAmount
    .plus(couponAccrual.exitAccruedInterest)
    .plus(couponAccrual.couponsReceived)
    .plus(amortizationsReceived)
    .minus(exitCommission);
  const profitBeforeTax = totalReceived.minus(totalPaid);
  const taxableProfit = Decimal.max(profitBeforeTax, 0);
  const tax = percentOf(taxableProfit, input.taxPercent);
  const profitAfterTax = profitBeforeTax.minus(tax);
  const dealReturnPercent = totalPaid.gt(0)
    ? profitAfterTax.div(totalPaid).mul(100)
    : null;
  const annualizedReturnPercent =
    dealReturnPercent && effectiveHoldingDays > 0
      ? dealReturnPercent.mul(365).div(effectiveHoldingDays)
      : null;
  const annualizedXirrPercent = calculateAnnualizedXirrPercent({
    buyDate: input.buyDate,
    exitDate: input.exitDate,
    totalPaid,
    exitAmount: exitCleanAmount
      .plus(couponAccrual.exitAccruedInterest)
      .minus(exitCommission),
    receiptFactor: totalReceived.gt(0)
      ? totalReceived.minus(tax).div(totalReceived)
      : new Decimal(1),
    coupons: getCashFlowsInsidePeriod(
      input.coupons ?? [],
      input.buyDate,
      input.exitDate,
    ),
    amortizations,
  });

  return {
    holdingDays: effectiveHoldingDays,
    buyCleanAmount: toNumber(buyCleanAmount),
    buyAccruedInterest: toNumber(buyAccruedInterest),
    buyCommission: toNumber(buyCommission),
    totalPaid: toNumber(totalPaid),
    exitCleanAmount: toNumber(exitCleanAmount),
    exitAccruedInterest: toNumber(couponAccrual.exitAccruedInterest),
    exitCommission: toNumber(exitCommission),
    couponsReceived: toNumber(couponAccrual.couponsReceived),
    amortizationsReceived: toNumber(amortizationsReceived),
    totalReceived: toNumber(totalReceived),
    profitBeforeTax: toNumber(profitBeforeTax),
    taxableProfit: toNumber(taxableProfit),
    tax: toNumber(tax),
    profitAfterTax: toNumber(profitAfterTax),
    dealReturnPercent: dealReturnPercent ? toNumber(dealReturnPercent) : null,
    annualizedXirrPercent,
    annualizedReturnPercent: annualizedReturnPercent
      ? toNumber(annualizedReturnPercent)
      : null,
    couponEffect: toNumber(
      couponAccrual.couponsReceived
        .plus(couponAccrual.exitAccruedInterest)
        .minus(buyAccruedInterest),
    ),
    nominalAtExit: toNumber(nominalAtExit),
    warnings: createWarnings({
      holdingDays,
      input,
    }),
  };
}

function calculateAnnualizedXirrPercent({
  buyDate,
  exitDate,
  totalPaid,
  exitAmount,
  receiptFactor,
  coupons,
  amortizations,
}: {
  buyDate: LocalDate;
  exitDate: LocalDate;
  totalPaid: Decimal;
  exitAmount: Decimal;
  receiptFactor: Decimal;
  coupons: BondCashFlow[];
  amortizations: BondCashFlow[];
}): number | null {
  if (getDaysBetween(buyDate, exitDate) === null || buyDate >= exitDate) {
    return null;
  }

  const cashFlows = [
    { date: toUtcDate(buyDate), amount: totalPaid.negated().toNumber() },
    ...coupons.map(({ date, amount }) => ({
      date: toUtcDate(date),
      amount: receiptFactor.mul(amount).toNumber(),
    })),
    ...amortizations.map(({ date, amount }) => ({
      date: toUtcDate(date),
      amount: receiptFactor.mul(amount).toNumber(),
    })),
    {
      date: toUtcDate(exitDate),
      amount: receiptFactor.mul(exitAmount).toNumber(),
    },
  ].filter(({ amount }) => amount !== 0);

  try {
    const rate = xirr(cashFlows);
    return Number.isFinite(rate) ? toNumber(new Decimal(rate).mul(100)) : null;
  } catch {
    return null;
  }
}

function toUtcDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function getDaysBetween(startDate: LocalDate, endDate: LocalDate): number | null {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.round((endMs - startMs) / MS_IN_DAY);
}

function calculateCouponAccrual({
  buyAccruedInterest,
  buyDate,
  exitDate,
  dailyCouponAccrual,
  coupons,
}: {
  buyAccruedInterest: Decimal;
  buyDate: LocalDate;
  exitDate: LocalDate;
  dailyCouponAccrual: Decimal;
  coupons: BondCashFlow[];
}): {
  exitAccruedInterest: Decimal;
  couponsReceived: Decimal;
} {
  const couponFlows = getCashFlowsInsidePeriod(coupons, buyDate, exitDate);
  let lastAccrualDate = buyDate;
  let accruedInterest = buyAccruedInterest;
  let couponsReceived = new Decimal(0);

  for (const coupon of couponFlows) {
    couponsReceived = couponsReceived.plus(coupon.amount);
    accruedInterest = new Decimal(0);
    lastAccrualDate = coupon.date;
  }

  const daysAfterLastCoupon = Math.max(
    getDaysBetween(lastAccrualDate, exitDate) ?? 0,
    0,
  );

  return {
    exitAccruedInterest: accruedInterest.plus(
      dailyCouponAccrual.mul(daysAfterLastCoupon),
    ),
    couponsReceived,
  };
}

function getDailyCouponAccrual(input: BondTradeInput): Decimal {
  if (isPositiveNumber(input.couponValue) && isPositiveNumber(input.couponPeriodDays)) {
    return toDecimal(input.couponValue).div(input.couponPeriodDays);
  }

  if (isPositiveNumber(input.couponAnnualPercent)) {
    return toDecimal(input.currentNominal).mul(input.couponAnnualPercent).div(36500);
  }

  return new Decimal(0);
}

function getCashFlowsInsidePeriod<T extends BondCashFlow>(
  cashFlows: T[],
  buyDate: LocalDate,
  exitDate: LocalDate,
): T[] {
  return cashFlows
    .filter((cashFlow) => cashFlow.date > buyDate && cashFlow.date <= exitDate)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function createWarnings({
  holdingDays,
  input,
}: {
  holdingDays: number | null;
  input: BondTradeInput;
}): string[] {
  const warnings: string[] = [];

  if (holdingDays === null) {
    warnings.push("Не удалось прочитать даты сделки.");
  } else if (holdingDays <= 0) {
    warnings.push("Доходность годовых считается только при сроке больше 0 дней.");
  }

  if (!isPositiveNumber(input.couponValue) && !isPositiveNumber(input.couponAnnualPercent)) {
    warnings.push("НКД продажи рассчитан без купонной ставки.");
  }

  return warnings;
}

function percentOf(amount: Decimal, percent: number): Decimal {
  return amount.mul(percent).div(100);
}

function sumCashFlows(cashFlows: BondCashFlow[]): Decimal {
  return sumDecimals(cashFlows.map((cashFlow) => toDecimal(cashFlow.amount)));
}

function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), new Decimal(0));
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function toDecimal(value: number): Decimal {
  return new Decimal(Number.isFinite(value) ? value : 0);
}

function toNumber(value: Decimal): number {
  return value.toDecimalPlaces(10).toNumber();
}
