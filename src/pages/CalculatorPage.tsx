import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CircleHelp, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  tooltipAlign?: "left" | "right";
  tooltipLabel?: string;
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
const XIRR_TOOLTIP =
  "Годовая доходность после налога с учетом дат купонов, амортизаций и погашения.";
const ANNUALIZED_PROFIT_TOOLTIP =
  "Прибыль после налога относительно затрат, линейно пересчитанная на год.";

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
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveCalculatorPreferences({
      commissionPercent: form.commissionPercent,
      taxPercent: form.taxPercent,
    });
  }, [form.commissionPercent, form.taxPercent]);

  useEffect(() => {
    if (!isShareMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !shareMenuRef.current?.contains(event.target)
      ) {
        setIsShareMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isShareMenuOpen]);

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
  const dohodBondIsin = data?.details.isin ?? data?.basicInfo.isin ?? null;
  const dohodBondUrl = dohodBondIsin
    ? `https://analytics.dohod.ru/bond/${encodeURIComponent(dohodBondIsin)}`
    : null;
  const externalLinks = dohodBondUrl
    ? [
        {
          href: dohodBondUrl,
          label: "Доходъ",
          icon: <DohodLogoIcon className="size-5" aria-hidden="true" />,
        },
      ]
    : [];
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
        {externalLinks.length > 0 ? (
          <div className="relative shrink-0" ref={shareMenuRef}>
            <button
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 shadow-sm"
              type="button"
              aria-label="Внешние ссылки"
              aria-haspopup="menu"
              aria-expanded={isShareMenuOpen}
              onClick={() => setIsShareMenuOpen((isOpen) => !isOpen)}
            >
              <ExternalLink className="size-5" aria-hidden="true" />
            </button>
            {isShareMenuOpen ? (
              <div
                className="absolute right-0 top-12 z-10 w-44 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
                role="menu"
              >
                {externalLinks.map((externalLink) => (
                  <a
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
                    href={externalLink.href}
                    key={externalLink.href}
                    target="_blank"
                    rel="noreferrer"
                    role="menuitem"
                    onClick={() => setIsShareMenuOpen(false)}
                  >
                    {externalLink.icon}
                    <span>{externalLink.label}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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

function ResultItem({
  label,
  value,
  strong = false,
  tooltip,
  tooltipAlign = "right",
  tooltipLabel = `Описание показателя «${label}»`,
}: ResultRow) {
  const tooltipId = `result-tooltip-${label.replace(/[^a-zа-яё0-9]+/gi, "-")}`;

  return (
    <>
      <dt className="flex items-center gap-1.5 text-neutral-700">
        {label}
        {tooltip ? (
          <span className="group relative inline-flex">
            <button
              aria-describedby={tooltipId}
              aria-label={tooltipLabel}
              className="rounded-full text-neutral-400 outline-none transition-colors hover:text-neutral-700 focus-visible:text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500"
              type="button"
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </button>
            <span
              className={`invisible absolute bottom-full z-10 mb-2 w-64 rounded-md bg-neutral-900 px-3 py-2 text-sm leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${tooltipAlign === "left" ? "left-0" : "right-0"}`}
              id={tooltipId}
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

function DohodLogoIcon({
  className,
  ...props
}: {
  className?: string;
  "aria-hidden"?: "true";
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 39.0757 39.0757"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.5378 0C30.3282 0 39.0757 8.74749 39.0757 19.5378C39.0757 30.3282 30.3282 39.0757 19.5378 39.0757C8.74749 39.0757 0 30.3282 0 19.5378C0 8.74749 8.74749 0 19.5378 0ZM11.4133 28.2184C13.57 28.2184 15.3449 26.5171 15.3449 24.3905C15.3449 22.2639 13.57 20.5325 11.4133 20.5325C9.25653 20.5325 7.46484 22.2773 7.46484 24.3905C7.46484 26.5037 9.23979 28.2184 11.4133 28.2184ZM11.4133 22.5251C12.4246 22.5251 13.2284 23.3456 13.2284 24.3871C13.2284 25.4287 12.4246 26.219 11.4133 26.219C10.4019 26.219 9.58138 25.4454 9.58138 24.3871C9.58138 23.3289 10.4019 22.5251 11.4133 22.5251ZM14.9062 29.0522C14.9062 28.9216 14.7756 28.7877 14.5847 28.7877H8.15807C7.96718 28.7877 7.84997 28.9183 7.84997 29.0522V30.6664C7.84997 30.7837 7.96718 30.9143 8.15807 30.9143H14.5847C14.7756 30.9143 14.9062 30.7837 14.9062 30.6664V29.0522ZM18.7542 20.2512L17.5519 18.57C17.5017 18.4997 17.495 18.4126 17.5352 18.3356C17.5754 18.2585 17.649 18.215 17.7361 18.215H18.6537C18.8044 18.215 18.9317 18.282 19.0188 18.4025L19.5445 19.1393L20.0703 18.4025C20.1574 18.282 20.288 18.215 20.4354 18.215H21.353C21.4401 18.215 21.5137 18.2585 21.5539 18.3356C21.5941 18.4126 21.5874 18.4997 21.5372 18.57L20.3349 20.2512L21.5372 21.9324C21.5874 22.0027 21.5941 22.0898 21.5539 22.1668C21.5137 22.2438 21.4401 22.2873 21.353 22.2873H20.4354C20.2847 22.2873 20.1574 22.2204 20.0703 22.0998L19.5445 21.363L19.0188 22.0998C18.9317 22.2204 18.8011 22.2873 18.6537 22.2873H17.7361C17.649 22.2873 17.5754 22.2438 17.5352 22.1668C17.495 22.0898 17.5017 22.0027 17.5519 21.9324L18.7542 20.2512ZM31.3999 30.566V29.0857C31.3999 28.9652 31.2659 28.8312 31.0717 28.8312H30.355V20.9143C30.355 20.7803 30.2478 20.6463 30.0569 20.6463H26.6912C24.5311 20.6463 23.0543 22.0027 23.0543 24.2063V28.2184C23.0543 28.7374 22.8131 28.8312 22.6088 28.8312H22.3108C22.1333 28.8312 22.0127 28.9652 22.0127 29.0857V30.566C22.0127 30.7602 22.1701 30.9176 22.3644 30.9176H31.0482C31.2425 30.9176 31.3999 30.7602 31.3999 30.566ZM25.1407 28.2184V24.2063C25.1407 23.2686 25.6765 22.7328 26.5405 22.7328H28.2686V28.8312H24.99C25.0938 28.5633 25.1373 28.3992 25.1373 28.2184H25.1407ZM32.1936 19.5177H34.0154C34.1058 19.5177 34.1828 19.5646 34.2264 19.645C34.2699 19.7254 34.2632 19.8158 34.213 19.8895L32.495 22.4682C32.4179 22.582 32.3007 22.6457 32.1634 22.6457H31.6611C31.5774 22.6457 31.5037 22.6122 31.4501 22.5486C31.3965 22.4849 31.3731 22.4079 31.3865 22.3242L31.7984 19.8526C31.8319 19.6584 31.996 19.5211 32.1902 19.5211L32.1936 19.5177ZM26.8687 14.4575C29.0255 14.4575 30.8004 12.7562 30.8004 10.6296C30.8004 8.50301 29.0255 6.7716 26.8687 6.7716C24.712 6.7716 22.9203 8.51641 22.9203 10.6296C22.9203 12.7428 24.6952 14.4575 26.8687 14.4575ZM26.8721 8.76423C27.8835 8.76423 28.6872 9.58473 28.6872 10.6263C28.6872 11.6678 27.8835 12.4581 26.8721 12.4581C25.8607 12.4581 25.0402 11.6845 25.0402 10.6263C25.0402 9.56798 25.8607 8.76423 26.8721 8.76423ZM30.3617 15.2914C30.3617 15.1607 30.2311 15.0268 30.0402 15.0268H23.6135C23.4226 15.0268 23.3054 15.1574 23.3054 15.2914V16.9056C23.3054 17.0228 23.4226 17.1534 23.6135 17.1534H30.0402C30.2311 17.1534 30.3617 17.0228 30.3617 16.9056V15.2914ZM15.9411 16.8051V15.3248C15.9411 15.2043 15.8071 15.0703 15.6129 15.0703H14.8962V7.15338C14.8962 7.01942 14.789 6.88547 14.5981 6.88547H11.2324C9.07234 6.88547 7.59545 8.2418 7.59545 10.4454V14.4575C7.59545 14.9766 7.35432 15.0703 7.14668 15.0703H6.84863C6.67113 15.0703 6.55057 15.2043 6.55057 15.3248V16.8051C6.55057 16.9993 6.70797 17.1567 6.90221 17.1567H15.5861C15.7803 17.1567 15.9377 16.9993 15.9377 16.8051H15.9411ZM9.68185 14.4575V10.4454C9.68185 9.5077 10.2177 8.97187 11.0817 8.97187H12.8098V15.0703H9.53115C9.63496 14.8024 9.6785 14.6383 9.6785 14.4575H9.68185Z"
        fill="#AB0033"
      />
    </svg>
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
        label: "доходность XIRR, годовая",
        value: formatPercent(result.annualizedXirrPercent),
        tooltip: XIRR_TOOLTIP,
        strong: true,
      },
      {
        label: "совокупная прибыль, годовая",
        value: formatPercent(result.annualizedReturnPercent),
        tooltip: ANNUALIZED_PROFIT_TOOLTIP,
      },
      {
        label: "тек. доходность",
        tooltip: CURRENT_YIELD_TOOLTIP,
        tooltipAlign: "left",
        tooltipLabel: "Формула текущей доходности",
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
    warnings.push(
      `Будущие купоны не определены. XIRR рассчитана при сохранении ставки ${formatInputNumber(annualPercent)} % годовых. Фактическая доходность может отличаться.`,
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

function createEmptyCalculationView(warnings: string[] = []): CalculationView {
  return {
    summaryRows: [
      {
        label: "доходность XIRR, годовая",
        value: "—",
        tooltip: XIRR_TOOLTIP,
        strong: true,
      },
      {
        label: "совокупная прибыль, годовая",
        value: "—",
        tooltip: ANNUALIZED_PROFIT_TOOLTIP,
      },
      {
        label: "тек. доходность",
        value: "—",
        tooltip: CURRENT_YIELD_TOOLTIP,
        tooltipAlign: "left",
        tooltipLabel: "Формула текущей доходности",
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
