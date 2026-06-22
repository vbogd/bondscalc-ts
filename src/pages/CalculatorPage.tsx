import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CircleHelp, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getBasicBondInfo,
  getBondDetails,
  getHistoricalBondSnapshot,
} from "../shared/api/moex";
import type {
  BasicBondInfo,
  BondAmortizationScheduleItem,
  BondCouponScheduleItem,
  BondDetails,
  LocalDate,
} from "../shared/api/moex";
import { calculateBondTrade } from "../shared/domain/bondTradeCalculator";
import {
  loadCalculatorPreferences,
  saveCalculatorPreferences,
} from "../shared/persistence";
import type { CalculatorPreferences } from "../shared/persistence";

type CalculatorMode = "maturity" | "offer" | "sale";

type CalculatorForm = {
  faceValue: string;
  couponPercent: string;
  commissionPercent: string;
  taxPercent: string;
  buyDate: string;
  buyPrice: string;
  sellDate: string;
  sellPrice: string;
};

type ResultRow = {
  label: string;
  value: string;
  strong?: boolean;
  tooltip?: string;
};

type ResultSection = {
  title: string;
  rows: ResultRow[];
};

type CalculationView = {
  summaryRows: ResultRow[];
  detailSections: ResultSection[];
  warnings: string[];
};

const DEFAULT_SELL_PRICE = "100";
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const CURRENT_YIELD_TOOLTIP = "Купон / цена покупки − налог";

const modeLabels: Record<CalculatorMode, string> = {
  maturity: "Погашение",
  offer: "Оферта",
  sale: "Продажа",
};

export function CalculatorPage() {
  const { secid = "SU26233RMFS5" } = useParams();
  const normalizedSecid = secid.trim().toUpperCase();
  const [mode, setMode] = useState<CalculatorMode>("maturity");
  const [form, setForm] = useState<CalculatorForm>(() => createDefaultForm());

  useEffect(() => {
    saveCalculatorPreferences({
      commissionPercent: form.commissionPercent,
      taxPercent: form.taxPercent,
    });
  }, [form.commissionPercent, form.taxPercent]);

  const { data, error, isError, isLoading } = useQuery({
    queryKey: ["bond-calculator", normalizedSecid],
    queryFn: async () => {
      const [basicInfo, details] = await Promise.all([
        getBasicBondInfo({ secid: normalizedSecid }),
        getBondDetails(normalizedSecid),
      ]);

      return { basicInfo, details };
    },
  });
  const historicalBuyDate = isPastLocalDate(form.buyDate) ? form.buyDate : null;
  const historicalSnapshotQuery = useQuery({
    queryKey: [
      "bond-calculator-history",
      normalizedSecid,
      data?.details.boardId,
      historicalBuyDate,
    ],
    queryFn: () => {
      if (!data || !historicalBuyDate) {
        throw new Error("Не удалось определить параметры исторического запроса.");
      }

      return getHistoricalBondSnapshot({
        secid: normalizedSecid,
        boardId: data.details.boardId,
        date: historicalBuyDate,
      });
    },
    enabled: Boolean(data && historicalBuyDate),
  });

  const targetDates = useMemo(
    () => (data ? getTargetDates(data.basicInfo, data.details) : null),
    [data],
  );

  useEffect(() => {
    if (!data || !targetDates) {
      return;
    }

    const initialMode = targetDates.offerDate ? "offer" : "maturity";

    setMode(initialMode);
    setForm((currentForm) =>
      createFormFromBond(data.basicInfo, targetDates, initialMode, {
        commissionPercent: currentForm.commissionPercent,
        taxPercent: currentForm.taxPercent,
      }),
    );
  }, [data, targetDates]);

  useEffect(() => {
    const faceValue = historicalBuyDate
      ? historicalSnapshotQuery.data?.faceValue
      : data?.basicInfo.face_value;

    if (faceValue === null || faceValue === undefined) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      faceValue: formatInputNumber(faceValue),
    }));
  }, [data?.basicInfo.face_value, historicalBuyDate, historicalSnapshotQuery.data]);

  const calculationView = useMemo(
    () =>
      createCalculationView({
        bond: data?.basicInfo ?? null,
        details: data?.details ?? null,
        form,
        mode,
        accruedInterest: historicalBuyDate
          ? historicalSnapshotQuery.data?.accruedInterest ?? null
          : data?.basicInfo.nkd ?? null,
        accruedInterestMessage: historicalBuyDate
          ? historicalSnapshotQuery.isError
            ? getErrorMessage(historicalSnapshotQuery.error)
            : historicalSnapshotQuery.isLoading
              ? "Загружаем исторический НКД из MOEX."
              : null
          : null,
      }),
    [
      data?.basicInfo,
      data?.details,
      form,
      historicalBuyDate,
      historicalSnapshotQuery.data,
      historicalSnapshotQuery.error,
      historicalSnapshotQuery.isError,
      historicalSnapshotQuery.isLoading,
      mode,
    ],
  );

  const title = data?.details.shortName ?? data?.basicInfo.shortname ?? normalizedSecid;
  const subtitle = data?.details.isin ?? data?.basicInfo.isin ?? normalizedSecid;
  const hasOffer = Boolean(targetDates?.offerDate);

  function handleModeChange(nextMode: CalculatorMode) {
    setMode(nextMode);

    if (!data || !targetDates) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      sellDate: getModeDate(
        nextMode,
        targetDates,
        nextMode === "sale"
          ? getDefaultSaleDate(currentForm.buyDate)
          : currentForm.sellDate,
      ),
      sellPrice: getModePrice(nextMode, targetDates),
    }));
  }

  function updateField(field: keyof CalculatorForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="mb-2 inline-flex size-10 items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 shadow-sm"
            to="/"
            aria-label="Назад к поиску"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="truncate text-3xl font-semibold tracking-normal text-neutral-950">
            {title}
          </h1>
          <p className="truncate text-lg text-neutral-500">{subtitle}</p>
        </div>
        <Link
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 shadow-sm"
          to="/"
          aria-label="Поиск облигаций"
        >
          <Search className="size-5" aria-hidden="true" />
        </Link>
      </header>

      {isLoading ? (
        <CalculatorState
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Загружаем облигацию"
          text="Получаем параметры выпуска и ближайшие даты из MOEX ISS."
        />
      ) : isError ? (
        <CalculatorState
          icon={<AlertCircle className="size-5" aria-hidden="true" />}
          title="Не удалось открыть калькулятор"
          text={getErrorMessage(error)}
          tone="danger"
        />
      ) : !data || !targetDates ? (
        <CalculatorState
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Готовим калькулятор"
          text="Собираем форму из параметров облигации."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="номинал"
              onChange={(value) => updateField("faceValue", value)}
              value={form.faceValue}
            />
            <InputField
              label="купон, % год"
              onChange={(value) => updateField("couponPercent", value)}
              value={form.couponPercent}
            />
            <InputField
              label="комиссия, %"
              onChange={(value) => updateField("commissionPercent", value)}
              value={form.commissionPercent}
            />
            <InputField
              label="налог, %"
              onChange={(value) => updateField("taxPercent", value)}
              value={form.taxPercent}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-neutral-950">Покупка</h2>
            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="дата сделки"
                onChange={(value) => updateField("buyDate", value)}
                type="date"
                value={form.buyDate}
              />
              <InputField
                label="цена, %"
                onChange={(value) => updateField("buyPrice", value)}
                value={form.buyPrice}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 rounded-lg border border-neutral-300 bg-white p-1 text-sm font-semibold">
            {(Object.keys(modeLabels) as CalculatorMode[]).map((modeKey) => {
              const isActive = mode === modeKey;
              const isDisabled = modeKey === "offer" && !hasOffer;

              return (
                <button
                  className={
                    isActive
                      ? "rounded-md bg-blue-600 px-2 py-3 text-white"
                      : isDisabled
                        ? "rounded-md px-2 py-3 text-neutral-300"
                        : "rounded-md px-2 py-3 text-neutral-600"
                  }
                  disabled={isDisabled}
                  key={modeKey}
                  onClick={() => handleModeChange(modeKey)}
                  type="button"
                >
                  {modeLabels[modeKey]}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="дата продажи"
              onChange={(value) => updateField("sellDate", value)}
              type="date"
              value={form.sellDate}
            />
            <InputField
              label="цена продажи, %"
              onChange={(value) => updateField("sellPrice", value)}
              value={form.sellPrice}
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
            <div className="border-b border-neutral-200 px-4 py-4">
              <h2 className="text-xl font-semibold text-neutral-950">Результаты</h2>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-5 text-xl">
              {calculationView.summaryRows.map((row) => (
                <ResultItem key={row.label} {...row} />
              ))}
            </dl>
            {calculationView.warnings.length > 0 ? (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {calculationView.warnings.join(" ")}
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
            <div className="border-b border-neutral-200 px-4 py-4">
              <h2 className="text-xl font-semibold text-neutral-950">Детализация</h2>
            </div>
            <div className="divide-y divide-neutral-200">
              {calculationView.detailSections.map((section) => (
                <div className="px-4 py-4" key={section.title}>
                  <h3 className="text-sm font-semibold uppercase text-neutral-500">
                    {section.title}
                  </h3>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-base">
                    {section.rows.map((row) => (
                      <ResultItem key={`${section.title}-${row.label}`} {...row} />
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function CalculatorState({
  icon,
  title,
  text,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-red-900"
          : "rounded-lg border border-neutral-200 bg-white px-4 py-5 text-neutral-700"
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-current">{icon}</div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-base">{text}</p>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "text";
  value: string;
}) {
  return (
    <label className="block rounded-lg border border-neutral-300 bg-white px-3 py-3 shadow-sm">
      <span className="block text-sm font-semibold uppercase text-neutral-500">
        {label}
      </span>
      <input
        className="mt-1 w-full border-0 bg-transparent text-2xl text-neutral-950 outline-none"
        inputMode={type === "date" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function ResultItem({ label, value, strong = false, tooltip }: ResultRow) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-neutral-700">
        {label}
        {tooltip ? (
          <span className="group relative inline-flex">
            <button
              aria-describedby="current-yield-tooltip"
              aria-label="Формула текущей доходности"
              className="rounded-full text-neutral-400 outline-none transition-colors hover:text-neutral-700 focus-visible:text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500"
              type="button"
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </button>
            <span
              className="invisible absolute bottom-full left-0 z-10 mb-2 w-64 rounded-md bg-neutral-900 px-3 py-2 text-sm leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              id="current-yield-tooltip"
              role="tooltip"
            >
              {tooltip}
            </span>
          </span>
        ) : null}
      </dt>
      <dd className={strong ? "font-semibold text-neutral-950" : "text-neutral-950"}>
        {value}
      </dd>
    </>
  );
}

function createDefaultForm(): CalculatorForm {
  const preferences = loadCalculatorPreferences();

  return {
    faceValue: "1000",
    couponPercent: "0",
    commissionPercent: preferences.commissionPercent,
    taxPercent: preferences.taxPercent,
    buyDate: getTodayLocalDate(),
    buyPrice: "100",
    sellDate: getTodayLocalDate(),
    sellPrice: DEFAULT_SELL_PRICE,
  };
}

function createFormFromBond(
  bond: BasicBondInfo,
  targetDates: TargetDates,
  mode: CalculatorMode,
  preferences: CalculatorPreferences,
): CalculatorForm {
  return {
    faceValue: formatInputNumber(bond.face_value),
    couponPercent: formatInputNumber(bond.coupon_percent ?? 0),
    commissionPercent: preferences.commissionPercent,
    taxPercent: preferences.taxPercent,
    buyDate: getTodayLocalDate(),
    buyPrice: formatInputNumber(getDisplayPrice(bond) ?? 100),
    sellDate: getModeDate(mode, targetDates, getTodayLocalDate()),
    sellPrice: getModePrice(mode, targetDates),
  };
}

type TargetDates = {
  maturityDate: LocalDate | null;
  offerDate: LocalDate | null;
  offerPrice: number | null;
};

function getTargetDates(bond: BasicBondInfo, details: BondDetails): TargetDates {
  const offerDate =
    details.nextOfferDate ??
    details.offerSchedule.find((offer) => isFutureOrToday(offer.date))?.date ??
    bond.offer_date;
  const matchingOffer = offerDate
    ? details.offerSchedule.find((offer) => offer.date === offerDate)
    : undefined;
  const offerPrice =
    matchingOffer?.pricePercent ??
    (matchingOffer?.value && bond.face_value > 0
      ? (matchingOffer.value / bond.face_value) * 100
      : null);

  return {
    maturityDate: details.maturityDate ?? bond.mat_date,
    offerDate,
    offerPrice,
  };
}

function getModeDate(
  mode: CalculatorMode,
  targetDates: TargetDates,
  fallbackDate: string,
): string {
  if (mode === "maturity") {
    return targetDates.maturityDate ?? fallbackDate;
  }

  if (mode === "offer") {
    return targetDates.offerDate ?? fallbackDate;
  }

  return fallbackDate;
}

function getModePrice(mode: CalculatorMode, targetDates: TargetDates): string {
  if (mode === "offer") {
    return formatInputNumber(targetDates.offerPrice ?? 100);
  }

  return DEFAULT_SELL_PRICE;
}

function getDefaultSaleDate(buyDate: LocalDate): LocalDate {
  return isPastLocalDate(buyDate) ? getTodayLocalDate() : addDays(buyDate, 1);
}

function createCalculationView({
  accruedInterest,
  accruedInterestMessage,
  bond,
  details,
  form,
  mode,
}: {
  accruedInterest: number | null;
  accruedInterestMessage: string | null;
  bond: BasicBondInfo | null;
  details: BondDetails | null;
  form: CalculatorForm;
  mode: CalculatorMode;
}): CalculationView {
  const faceValue = parseDecimal(form.faceValue);
  const couponPercent = parseDecimal(form.couponPercent);
  const commissionPercent = parseDecimal(form.commissionPercent);
  const taxPercent = parseDecimal(form.taxPercent);
  const buyPrice = parseDecimal(form.buyPrice);
  const sellPrice = parseDecimal(form.sellPrice);
  const days = getDaysBetween(form.buyDate, form.sellDate);

  if (
    faceValue === null ||
    couponPercent === null ||
    commissionPercent === null ||
    taxPercent === null ||
    buyPrice === null ||
    sellPrice === null ||
    days === null ||
    !bond ||
    !details
  ) {
    return createEmptyCalculationView();
  }

  if (accruedInterest === null) {
    return createEmptyCalculationView(
      accruedInterestMessage ? [accruedInterestMessage] : [],
    );
  }

  const amortizationProjection = createAmortizationCashFlows({
    schedule: details.amortizationSchedule,
    buyDate: form.buyDate,
    exitDate: form.sellDate,
    currentNominal: faceValue,
  });
  const couponProjection = createCouponCashFlows({
    schedule: details.couponSchedule,
    amortizations: amortizationProjection.cashFlows,
    buyDate: form.buyDate,
    exitDate: form.sellDate,
    currentNominal: faceValue,
    annualPercent: couponPercent,
    fallbackCouponDate: bond.coupon_date,
    fallbackCouponAmount: bond.coupon_value,
    fallbackCouponPeriodDays: bond.coupon_period,
  });
  const exitAccrualTerms = getExitAccrualTerms({
    schedule: details.couponSchedule,
    exitDate: form.sellDate,
    fallbackCouponAmount: bond.coupon_value,
    fallbackCouponPeriodDays: bond.coupon_period,
  });

  const result = calculateBondTrade({
    currentNominal: faceValue,
    buyPricePercent: buyPrice,
    exitPricePercent: sellPrice,
    buyDate: form.buyDate,
    exitDate: form.sellDate,
    buyAccruedInterest: accruedInterest,
    commissionPercent,
    exitCommissionPercent: mode === "sale" ? commissionPercent : 0,
    taxPercent,
    couponAnnualPercent: couponPercent,
    couponValue:
      couponProjection.forecastCount > 0 ? null : exitAccrualTerms.couponAmount,
    couponPeriodDays: exitAccrualTerms.couponPeriodDays,
    coupons: couponProjection.cashFlows,
    amortizations: amortizationProjection.cashFlows,
  });
  const currency = bond.currency_id;

  return {
    summaryRows: [
      {
        label: "доходность, год",
        value: formatPercent(result.annualizedReturnPercent),
      },
      {
        label: "тек. доходность",
        tooltip: CURRENT_YIELD_TOOLTIP,
        value: formatPercent(
          calculateCurrentYieldAfterTax({
            couponPercent,
            pricePercent: buyPrice,
            taxPercent,
          }),
        ),
      },
      {
        label: "прибыль после налога",
        value: formatMoney(result.profitAfterTax, currency),
        strong: true,
      },
      { label: "срок, дней", value: formatNumber(result.holdingDays) },
    ],
    detailSections: [
      {
        title: "Покупка",
        rows: [
          { label: "чистая цена", value: formatMoney(result.buyCleanAmount, currency) },
          {
            label: "НКД покупки",
            value: formatMoney(result.buyAccruedInterest, currency),
          },
          { label: "комиссия", value: formatMoney(result.buyCommission, currency) },
          {
            label: "итого списано",
            value: formatMoney(result.totalPaid, currency),
            strong: true,
          },
        ],
      },
      {
        title: "Продажа",
        rows: [
          {
            label: "чистая цена",
            value: formatMoney(result.exitCleanAmount, currency),
          },
          {
            label: "НКД продажи",
            value: formatMoney(result.exitAccruedInterest, currency),
          },
          {
            label: "комиссия продажи",
            value: formatMoney(result.exitCommission, currency),
          },
          {
            label: "получено купонов",
            value: formatMoney(result.couponsReceived, currency),
          },
          {
            label: "амортизация за период",
            value: formatMoney(result.amortizationsReceived, currency),
          },
          {
            label: "итого получено",
            value: formatMoney(result.totalReceived, currency),
            strong: true,
          },
        ],
      },
      {
        title: "Налог и результат",
        rows: [
          {
            label: "прибыль до налога",
            value: formatMoney(result.profitBeforeTax, currency),
          },
          { label: "налог", value: formatMoney(result.tax, currency) },
          {
            label: "купонный эффект",
            value: formatMoney(result.couponEffect, currency),
          },
        ],
      },
    ],
    warnings: [
      ...result.warnings,
      ...createCashFlowWarnings({
        forecastCouponCount: couponProjection.forecastCount,
        missingCouponCount: couponProjection.missingCount,
        missingAmortizationCount: amortizationProjection.missingCount,
        annualPercent: couponPercent,
      }),
    ],
  };
}

type CashFlow = {
  date: LocalDate;
  amount: number;
};

function createCouponCashFlows({
  schedule,
  amortizations,
  buyDate,
  exitDate,
  currentNominal,
  annualPercent,
  fallbackCouponDate,
  fallbackCouponAmount,
  fallbackCouponPeriodDays,
}: {
  schedule: BondCouponScheduleItem[];
  amortizations: CashFlow[];
  buyDate: LocalDate;
  exitDate: LocalDate;
  currentNominal: number;
  annualPercent: number;
  fallbackCouponDate: LocalDate;
  fallbackCouponAmount: number | null;
  fallbackCouponPeriodDays: number;
}): {
  cashFlows: CashFlow[];
  forecastCount: number;
  missingCount: number;
} {
  if (schedule.length === 0) {
    const fallbackCashFlows = createFallbackCouponCashFlows({
      buyDate,
      exitDate,
      couponDate: fallbackCouponDate,
      couponAmount: fallbackCouponAmount,
      couponPeriodDays: fallbackCouponPeriodDays,
    });

    return {
      cashFlows: fallbackCashFlows,
      forecastCount: fallbackCashFlows.length,
      missingCount: 0,
    };
  }

  const today = getTodayLocalDate();
  const cashFlows: CashFlow[] = [];
  let forecastCount = 0;
  let missingCount = 0;

  for (const coupon of schedule) {
    if (coupon.date <= buyDate || coupon.date > exitDate) {
      continue;
    }

    if (coupon.amount !== null) {
      cashFlows.push({ date: coupon.date, amount: coupon.amount });
      continue;
    }

    const couponPeriodDays = coupon.startDate
      ? getDaysBetween(coupon.startDate, coupon.date)
      : fallbackCouponPeriodDays;

    if (
      coupon.date <= today ||
      annualPercent <= 0 ||
      couponPeriodDays === null ||
      couponPeriodDays <= 0
    ) {
      missingCount += 1;
      continue;
    }

    const nominalReduction = amortizations
      .filter(
        (amortization) =>
          amortization.date > buyDate && amortization.date < coupon.date,
      )
      .reduce((sum, amortization) => sum + amortization.amount, 0);
    const nominalAtCoupon = Math.max(currentNominal - nominalReduction, 0);
    const amount =
      (nominalAtCoupon * annualPercent * couponPeriodDays) / 36_500;

    cashFlows.push({ date: coupon.date, amount });
    forecastCount += 1;
  }

  return { cashFlows, forecastCount, missingCount };
}

function createFallbackCouponCashFlows({
  buyDate,
  exitDate,
  couponDate,
  couponAmount,
  couponPeriodDays,
}: {
  buyDate: LocalDate;
  exitDate: LocalDate;
  couponDate: LocalDate;
  couponAmount: number | null;
  couponPeriodDays: number;
}): CashFlow[] {
  if (couponAmount === null || couponPeriodDays <= 0) {
    return [];
  }

  const coupons: CashFlow[] = [];
  let nextCouponDate = couponDate;

  while (nextCouponDate <= exitDate && coupons.length < 200) {
    if (nextCouponDate > buyDate) {
      coupons.push({ date: nextCouponDate, amount: couponAmount });
    }

    nextCouponDate = addDays(nextCouponDate, couponPeriodDays);
  }

  return coupons;
}

function createAmortizationCashFlows({
  schedule,
  buyDate,
  exitDate,
  currentNominal,
}: {
  schedule: BondAmortizationScheduleItem[];
  buyDate: LocalDate;
  exitDate: LocalDate;
  currentNominal: number;
}): { cashFlows: CashFlow[]; missingCount: number } {
  const cashFlows: CashFlow[] = [];
  let missingCount = 0;

  for (const amortization of schedule) {
    if (amortization.date <= buyDate || amortization.date > exitDate) {
      continue;
    }

    const amount =
      amortization.amount ??
      (amortization.percent === null
        ? null
        : (currentNominal * amortization.percent) / 100);

    if (amount === null) {
      missingCount += 1;
      continue;
    }

    cashFlows.push({ date: amortization.date, amount });
  }

  return { cashFlows, missingCount };
}

function getExitAccrualTerms({
  schedule,
  exitDate,
  fallbackCouponAmount,
  fallbackCouponPeriodDays,
}: {
  schedule: BondCouponScheduleItem[];
  exitDate: LocalDate;
  fallbackCouponAmount: number | null;
  fallbackCouponPeriodDays: number;
}): { couponAmount: number | null; couponPeriodDays: number } {
  const containingCoupon = schedule.find((coupon) => coupon.date > exitDate);
  const couponPeriodDays = containingCoupon?.startDate
    ? getDaysBetween(containingCoupon.startDate, containingCoupon.date)
    : null;

  return {
    couponAmount: containingCoupon?.amount ?? fallbackCouponAmount,
    couponPeriodDays:
      couponPeriodDays && couponPeriodDays > 0
        ? couponPeriodDays
        : fallbackCouponPeriodDays,
  };
}

function createCashFlowWarnings({
  forecastCouponCount,
  missingCouponCount,
  missingAmortizationCount,
  annualPercent,
}: {
  forecastCouponCount: number;
  missingCouponCount: number;
  missingAmortizationCount: number;
  annualPercent: number;
}): string[] {
  const warnings: string[] = [];

  if (forecastCouponCount > 0) {
    const forecastText = formatForecastCouponCount(forecastCouponCount);

    warnings.push(
      `${forecastCouponCount} ${forecastText} прогнозно по ставке ${formatInputNumber(annualPercent)} %.`,
    );
  }

  if (missingCouponCount > 0) {
    warnings.push(`Не удалось определить сумму купонов: ${missingCouponCount}.`);
  }

  if (missingAmortizationCount > 0) {
    warnings.push(
      `Не удалось определить сумму амортизаций: ${missingAmortizationCount}.`,
    );
  }

  return warnings;
}

function formatForecastCouponCount(count: number): string {
  const modulo10 = count % 10;
  const modulo100 = count % 100;

  if (modulo10 === 1 && modulo100 !== 11) {
    return "будущий купон рассчитан";
  }

  if (modulo10 >= 2 && modulo10 <= 4 && (modulo100 < 12 || modulo100 > 14)) {
    return "будущих купона рассчитаны";
  }

  return "будущих купонов рассчитаны";
}

function createEmptyCalculationView(warnings: string[] = []): CalculationView {
  return {
    summaryRows: [
      { label: "доходность, год", value: "—" },
      {
        label: "тек. доходность",
        value: "—",
        tooltip: CURRENT_YIELD_TOOLTIP,
      },
      { label: "прибыль после налога", value: "—", strong: true },
      { label: "срок, дней", value: "—" },
    ],
    detailSections: [
      {
        title: "Покупка",
        rows: [
          { label: "чистая цена", value: "—" },
          { label: "НКД покупки", value: "—" },
          { label: "комиссия", value: "—" },
          { label: "итого списано", value: "—", strong: true },
        ],
      },
      {
        title: "Продажа",
        rows: [
          { label: "чистая цена", value: "—" },
          { label: "НКД продажи", value: "—" },
          { label: "комиссия продажи", value: "—" },
          { label: "получено купонов", value: "—" },
          { label: "амортизация за период", value: "—" },
          { label: "итого получено", value: "—", strong: true },
        ],
      },
      {
        title: "Налог и результат",
        rows: [
          { label: "прибыль до налога", value: "—" },
          { label: "налог", value: "—" },
          { label: "купонный эффект", value: "—" },
        ],
      },
    ],
    warnings,
  };
}

function calculateCurrentYieldAfterTax({
  couponPercent,
  pricePercent,
  taxPercent,
}: {
  couponPercent: number;
  pricePercent: number;
  taxPercent: number;
}): number | null {
  if (pricePercent <= 0) {
    return null;
  }

  return (couponPercent * (1 - taxPercent / 100) * 100) / pricePercent;
}

function parseDecimal(value: string): number | null {
  const normalizedValue = value.trim().replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getDaysBetween(startDate: string, endDate: string): number | null {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(0, Math.round((endMs - startMs) / MS_IN_DAY));
}

function addDays(date: string, days: number): string {
  const dateMs = Date.parse(`${date}T00:00:00Z`);

  if (!Number.isFinite(dateMs)) {
    return date;
  }

  return new Date(dateMs + days * MS_IN_DAY).toISOString().slice(0, 10);
}

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isPastLocalDate(date: LocalDate): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < getTodayLocalDate();
}

function isFutureOrToday(date: LocalDate): boolean {
  return date >= getTodayLocalDate();
}

function getDisplayPrice(bond: BasicBondInfo): number | null {
  return bond.last_price ?? bond.prev_price;
}

function formatMoney(value: number, currency: string): string {
  return `${formatNumber(value, { fractionDigits: 2 })} ${formatCurrencyUnit(currency)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value, { fractionDigits: 2 })} %`;
}

function formatNumber(
  value: number,
  { fractionDigits }: { fractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: fractionDigits ?? 4,
    minimumFractionDigits: fractionDigits ?? 0,
  }).format(value);
}

function formatInputNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value);
}

function formatCurrencyUnit(currency: string): string {
  const currencySymbols: Record<string, string> = {
    SUR: "₽",
    RUB: "₽",
    USD: "$",
    EUR: "€",
    CNY: "¥",
  };

  return currencySymbols[currency] ?? currency;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Попробуйте повторить запрос позже.";
}
