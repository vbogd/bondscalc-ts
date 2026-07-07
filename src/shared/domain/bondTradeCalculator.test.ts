import { describe, expect, it } from "vitest";
import { calculateBondTrade } from "./bondTradeCalculator";
import type { BondTradeInput } from "./bondTradeCalculator";

describe("calculateBondTrade", () => {
  it("calculates a profitable 1 day sale with commissions, tax and accrued interest", () => {
    const result = calculateBondTrade(
      createInput({
        buyPricePercent: 100,
        exitPricePercent: 101,
        buyAccruedInterest: 10,
        commissionPercent: 0.05,
        exitCommissionPercent: 0.05,
        taxPercent: 13,
        couponValue: 50,
        couponPeriodDays: 100,
        buyDate: "2026-01-01",
        exitDate: "2026-01-02",
      }),
    );

    expect(result.holdingDays).toBe(1);
    expect(result.buyCleanAmount).toBe(1000);
    expect(result.exitAccruedInterest).toBe(10.5);
    expect(result.totalPaid).toBeCloseTo(1010.5, 6);
    expect(result.totalReceived).toBeCloseTo(1019.995, 6);
    expect(result.profitBeforeTax).toBeCloseTo(9.495, 6);
    expect(result.tax).toBeCloseTo(1.23435, 6);
    expect(result.profitAfterTax).toBeCloseTo(8.26065, 6);
    expect(result.dealReturnPercent).toBeCloseTo(0.817481, 6);
    expect(result.annualizedReturnPercent).toBeCloseTo(298.3807, 4);
  });

  it("keeps tax at zero for a losing trade", () => {
    const result = calculateBondTrade(
      createInput({
        buyPricePercent: 100,
        exitPricePercent: 99,
        taxPercent: 13,
      }),
    );

    expect(result.profitBeforeTax).toBeLessThan(0);
    expect(result.taxableProfit).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.profitAfterTax).toBe(result.profitBeforeTax);
  });

  it("supports zero commission and zero tax", () => {
    const result = calculateBondTrade(
      createInput({
        buyPricePercent: 100,
        exitPricePercent: 101,
        commissionPercent: 0,
        exitCommissionPercent: 0,
        taxPercent: 0,
      }),
    );

    expect(result.buyCommission).toBe(0);
    expect(result.exitCommission).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.profitAfterTax).toBeCloseTo(result.profitBeforeTax, 6);
  });

  it("resets accrued interest and includes a coupon inside the holding period", () => {
    const result = calculateBondTrade(
      createInput({
        buyAccruedInterest: 20,
        couponValue: 30,
        couponPeriodDays: 30,
        buyDate: "2026-01-01",
        exitDate: "2026-01-06",
        coupons: [{ date: "2026-01-05", amount: 30 }],
        commissionPercent: 0,
        exitCommissionPercent: 0,
        taxPercent: 0,
      }),
    );

    expect(result.couponsReceived).toBe(30);
    expect(result.exitAccruedInterest).toBe(1);
    expect(result.couponEffect).toBe(11);
    expect(result.profitAfterTax).toBe(11);
  });

  it("reduces nominal at exit when amortization is paid inside the period", () => {
    const result = calculateBondTrade(
      createInput({
        buyDate: "2026-01-01",
        exitDate: "2026-01-10",
        amortizations: [{ date: "2026-01-05", amount: 100 }],
        commissionPercent: 0,
        exitCommissionPercent: 0,
        taxPercent: 0,
      }),
    );

    expect(result.amortizationsReceived).toBe(100);
    expect(result.nominalAtExit).toBe(900);
    expect(result.exitCleanAmount).toBe(900);
    expect(result.profitAfterTax).toBe(0);
  });

  it("calculates XIRR from dated coupon and principal cash flows", () => {
    const result = calculateBondTrade(
      createInput({
        buyDate: "2026-01-01",
        exitDate: "2027-01-01",
        coupons: [
          { date: "2026-07-02", amount: 50 },
          { date: "2027-01-01", amount: 50 },
        ],
        commissionPercent: 0,
        exitCommissionPercent: 0,
        taxPercent: 0,
      }),
    );

    expect(result.annualizedReturnPercent).toBe(10);
    expect(result.annualizedXirrPercent).toBeCloseTo(10.25, 2);
  });

  it("does not annualize a same-day or invalid holding period", () => {
    const result = calculateBondTrade(
      createInput({
        buyDate: "2026-01-01",
        exitDate: "2026-01-01",
      }),
    );

    expect(result.holdingDays).toBe(0);
    expect(result.annualizedReturnPercent).toBeNull();
    expect(result.annualizedXirrPercent).toBeNull();
    expect(result.warnings).toContain(
      "Доходность годовых считается только при сроке больше 0 дней.",
    );
  });
});

function createInput(overrides: Partial<BondTradeInput> = {}): BondTradeInput {
  return {
    currentNominal: 1000,
    buyPricePercent: 100,
    exitPricePercent: 100,
    buyDate: "2026-01-01",
    exitDate: "2026-01-02",
    buyAccruedInterest: 0,
    commissionPercent: 0.05,
    exitCommissionPercent: 0.05,
    taxPercent: 13,
    couponAnnualPercent: 0,
    couponValue: 0,
    couponPeriodDays: 0,
    coupons: [],
    amortizations: [],
    ...overrides,
  };
}
