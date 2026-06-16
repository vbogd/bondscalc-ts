import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getBasicBondInfo, getBondDetails } from "../shared/api/moex";
import type { BasicBondInfo, BondDetails, LocalDate } from "../shared/api/moex";
import { calculateBondTrade } from "../shared/domain/bondTradeCalculator";

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

const DEFAULT_COMMISSION_PERCENT = "0.05";
const DEFAULT_TAX_PERCENT = "13";
const DEFAULT_SELL_PRICE = "100";
const MS_IN_DAY = 24 * 60 * 60 * 1000;

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
    setForm(createFormFromBond(data.basicInfo, targetDates, initialMode));
  }, [data, targetDates]);

  const calculationView = useMemo(
    () =>
      createCalculationView({
        bond: data?.basicInfo ?? null,
        form,
        mode,
        accruedInterest: data?.basicInfo.nkd ?? null,
      }),
    [data?.basicInfo, form, mode],
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
        nextMode === "sale" ? addDays(currentForm.buyDate, 1) : currentForm.sellDate,
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
                label="дата"
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
              <p className="mt-1 text-sm text-neutral-500">
                НКД продажи считается по ближайшему купону и дневному накоплению.
              </p>
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

function ResultItem({ label, value, strong = false }: ResultRow) {
  return (
    <>
      <dt className="text-neutral-700">{label}</dt>
      <dd className={strong ? "font-semibold text-neutral-950" : "text-neutral-950"}>
        {value}
      </dd>
    </>
  );
}

function createDefaultForm(): CalculatorForm {
  return {
    faceValue: "1000",
    couponPercent: "0",
    commissionPercent: DEFAULT_COMMISSION_PERCENT,
    taxPercent: DEFAULT_TAX_PERCENT,
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
): CalculatorForm {
  return {
    faceValue: formatInputNumber(bond.face_value),
    couponPercent: formatInputNumber(bond.coupon_percent ?? 0),
    commissionPercent: DEFAULT_COMMISSION_PERCENT,
    taxPercent: DEFAULT_TAX_PERCENT,
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

function createCalculationView({
  accruedInterest,
  bond,
  form,
  mode,
}: {
  accruedInterest: number | null;
  bond: BasicBondInfo | null;
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
    !bond
  ) {
    return createEmptyCalculationView();
  }

  const result = calculateBondTrade({
    currentNominal: faceValue,
    buyPricePercent: buyPrice,
    exitPricePercent: sellPrice,
    buyDate: form.buyDate,
    exitDate: form.sellDate,
    buyAccruedInterest: accruedInterest ?? 0,
    commissionPercent,
    exitCommissionPercent: mode === "sale" ? commissionPercent : 0,
    taxPercent,
    couponAnnualPercent: couponPercent,
    couponValue: bond.coupon_value,
    couponPeriodDays: bond.coupon_period,
    coupons: createKnownCoupons(bond, form.sellDate),
    amortizations: [],
  });
  const currency = bond.currency_id;

  return {
    summaryRows: [
      {
        label: "прибыль после налога",
        value: formatMoney(result.profitAfterTax, currency),
        strong: true,
      },
      {
        label: "доходность, год",
        value: formatPercent(result.annualizedReturnPercent),
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
            label: "чистая цена продажи",
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
            label: "купоны за период",
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
    warnings: result.warnings,
  };
}

function createKnownCoupons(bond: BasicBondInfo, exitDate: LocalDate) {
  if (!bond.coupon_date || bond.coupon_value === null || bond.coupon_period <= 0) {
    return [];
  }

  const coupons = [];
  let couponDate = bond.coupon_date;

  while (couponDate <= exitDate && coupons.length < 200) {
    coupons.push({ date: couponDate, amount: bond.coupon_value });
    couponDate = addDays(couponDate, bond.coupon_period);
  }

  return coupons;
}

function createEmptyCalculationView(): CalculationView {
  return {
    summaryRows: [
      { label: "прибыль после налога", value: "—", strong: true },
      { label: "доходность, год", value: "—" },
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
          { label: "чистая цена продажи", value: "—" },
          { label: "НКД продажи", value: "—" },
          { label: "комиссия продажи", value: "—" },
          { label: "купоны за период", value: "—" },
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
    warnings: [],
  };
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
