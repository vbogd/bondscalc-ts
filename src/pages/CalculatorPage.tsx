import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getBondDetails,
  getHistoricalBondSnapshot,
  primaryBondSnapshotQuery,
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
import {
  InputField,
  ModeToggle,
  ResultPanel,
  ResultRow,
  StateMessage,
} from "../shared/ui/FinancialUi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type CalculationRow = {
  label: string;
  value: string;
  strong?: boolean;
  tooltip?: string;
  tooltipLabel?: string;
  valueTone?: "neutral" | "danger" | "up" | "down";
};

type ResultSection = {
  title: string;
  rows: CalculationRow[];
};

type CalculationView = {
  summaryRows: CalculationRow[];
  detailSections: ResultSection[] | null;
  warningAlert: string | null;
  warnings: string[];
};

const DEFAULT_SELL_PRICE = "100";
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const CURRENT_YIELD_TOOLTIP = "Текущая доходность по формуле:\nКупон / цена покупки − налог";
const XIRR_LABEL = "доходность XIRR";
const XIRR_TOOLTIP =
  "Годовая доходность с учетом дат купонов, амортизаций и погашения.";
const ANNUALIZED_PROFIT_LABEL = "доходность, год";
const ANNUALIZED_PROFIT_TOOLTIP =
  "Прибыль после налога относительно затрат, линейно пересчитанная на год.";
const MISSING_NOMINAL_CURRENCY_ACCRUED_INTEREST_MESSAGE =
  "НКД в валюте номинала недоступен через MOEX API.\nВ расчетах используется НКД равный 0.";

const modeLabels: Record<CalculatorMode, string> = {
  maturity: "Погашение",
  offer: "Оферта",
  sale: "Продажа",
};

export function CalculatorPage() {
  const { secid = "SU26233RMFS5" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedSecid = secid.trim().toUpperCase();
  const cameFromSearch = location.state?.fromSearch === true;
  const [mode, setMode] = useState<CalculatorMode>("maturity");
  const [form, setForm] = useState<CalculatorForm>(() => createDefaultForm());
  const [editedFields, setEditedFields] = useState<Set<keyof CalculatorForm>>(
    () => new Set(),
  );
  const [hasPendingMoexUpdate, setHasPendingMoexUpdate] = useState(false);
  const [showOfferUnavailableAlert, setShowOfferUnavailableAlert] = useState(false);
  const [copiedIsin, setCopiedIsin] = useState(false);
  const [ignoredCosts, setIgnoredCosts] = useState<string[]>([]);
  const copyResetTimerRef = useRef<number | null>(null);
  const offerUnavailableTimerRef = useRef<number | null>(null);
  const initializedSecidRef = useRef<string | null>(null);
  const modeRef = useRef<CalculatorMode>("maturity");
  const processedDataRef = useRef<{
    basicInfo: BasicBondInfo;
    details: BondDetails;
  } | null>(null);
  const isFormDirty = editedFields.size > 0;

  useEffect(() => {
    saveCalculatorPreferences({
      commissionPercent: form.commissionPercent,
      taxPercent: form.taxPercent,
    });
  }, [form.commissionPercent, form.taxPercent]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      if (offerUnavailableTimerRef.current !== null) {
        window.clearTimeout(offerUnavailableTimerRef.current);
      }
    };
  }, []);

  const primaryBondSnapshotQueryResult = useQuery(primaryBondSnapshotQuery);
  const basicInfo = primaryBondSnapshotQueryResult.data?.find(
    (bond) => bond.secid === normalizedSecid,
  );
  const bondDetailsQuery = useQuery({
    queryKey: [
      "bond-calculator-details",
      normalizedSecid,
      basicInfo?.board_id,
      basicInfo?.offer_date,
    ],
    queryFn: () => getBondDetails(basicInfo!),
    enabled: Boolean(basicInfo),
  });
  const data = useMemo(
    () =>
      basicInfo && bondDetailsQuery.data
        ? { basicInfo, details: bondDetailsQuery.data }
        : undefined,
    [basicInfo, bondDetailsQuery.data],
  );
  const snapshotBondNotFound =
    primaryBondSnapshotQueryResult.data !== undefined && !basicInfo;
  const error =
    primaryBondSnapshotQueryResult.error ??
    bondDetailsQuery.error ??
    (snapshotBondNotFound
      ? new Error(`MOEX не вернула базовые данные для ${normalizedSecid}.`)
      : null);
  const isError =
    primaryBondSnapshotQueryResult.isError ||
    bondDetailsQuery.isError ||
    snapshotBondNotFound;
  const isLoading =
    primaryBondSnapshotQueryResult.isLoading ||
    (Boolean(basicInfo) && bondDetailsQuery.isLoading);
  const historicalBuyDate = isPastLocalDate(form.buyDate) ? form.buyDate : null;
  const historicalSnapshotQuery = useQuery({
    queryKey: [
      "bond-calculator-history",
      normalizedSecid,
      data?.details.cashFlowBoardId,
      historicalBuyDate,
    ],
    queryFn: () => {
      if (!data || !historicalBuyDate) {
        throw new Error("Не удалось определить параметры исторического запроса.");
      }

      return getHistoricalBondSnapshot({
        secid: normalizedSecid,
        boardId: data.details.cashFlowBoardId!,
        date: historicalBuyDate,
      });
    },
    enabled: Boolean(data?.details.cashFlowBoardId && historicalBuyDate),
  });
  const usesZeroAccruedInterestFallback = Boolean(
    data &&
      isForeignCurrencyBond(data.basicInfo) &&
      (historicalBuyDate
        ? !data.details.cashFlowBoardId
        : getCashFlowAccruedInterest(data.details) === null),
  );

  const targetDates = useMemo(
    () => (data ? getTargetDates(data.basicInfo, data.details) : null),
    [data],
  );

  useEffect(() => {
    if (!data || !targetDates) {
      return;
    }

    const isNewBond = initializedSecidRef.current !== normalizedSecid;
    const hasNewData = processedDataRef.current !== data;

    if (!isNewBond && !hasNewData) {
      return;
    }

    initializedSecidRef.current = normalizedSecid;
    processedDataRef.current = data;

    if (isNewBond) {
      setIgnoredCosts([]);
    }

    const initialMode = targetDates.offerDate ? "offer" : "maturity";
    const offerWasRemoved =
      !isNewBond && modeRef.current === "offer" && !targetDates.offerDate;
    const nextMode = isNewBond ? initialMode : offerWasRemoved ? "maturity" : modeRef.current;
    const shouldApplyMoexValues = isNewBond || !isFormDirty;

    if (offerWasRemoved) {
      modeRef.current = "maturity";
      setMode("maturity");
      setShowOfferUnavailableAlert(true);

      if (offerUnavailableTimerRef.current !== null) {
        window.clearTimeout(offerUnavailableTimerRef.current);
      }

      offerUnavailableTimerRef.current = window.setTimeout(() => {
        setShowOfferUnavailableAlert(false);
        offerUnavailableTimerRef.current = null;
      }, 1_000);
    }

    if (shouldApplyMoexValues) {
      modeRef.current = nextMode;
      setMode(nextMode);
      setForm((currentForm) =>
        createFormFromBond(data.basicInfo, data.details, targetDates, nextMode, {
          commissionPercent: currentForm.commissionPercent,
          taxPercent: currentForm.taxPercent,
        }),
      );
      setEditedFields(new Set());
      setHasPendingMoexUpdate(false);
    } else if (offerWasRemoved) {
      setForm((currentForm) => ({
        ...currentForm,
        sellDate: getModeDate("maturity", targetDates, currentForm.sellDate),
        sellPrice: getModePrice("maturity", targetDates),
      }));
      setHasPendingMoexUpdate(true);
    } else {
      setHasPendingMoexUpdate(true);
    }
  }, [data, isFormDirty, normalizedSecid, targetDates]);

  useEffect(() => {
    const faceValue = historicalBuyDate
      ? historicalSnapshotQuery.data?.faceValue
      : data?.basicInfo.face_value;

    if (faceValue === null || faceValue === undefined) {
      return;
    }

    if (!editedFields.has("faceValue")) {
      setForm((currentForm) => ({
        ...currentForm,
        faceValue: formatInputNumber(faceValue),
      }));
    }
  }, [
    data?.basicInfo.face_value,
    editedFields,
    historicalBuyDate,
    historicalSnapshotQuery.data,
  ]);

  const calculationView = useMemo(
    () =>
      createCalculationView({
        bond: data?.basicInfo ?? null,
        details: data?.details ?? null,
        form: {
          ...form,
          commissionPercent: ignoredCosts.includes("commission")
            ? "0"
            : form.commissionPercent,
          taxPercent: ignoredCosts.includes("tax") ? "0" : form.taxPercent,
        },
        mode,
        accruedInterest: historicalBuyDate
          ? historicalSnapshotQuery.data?.accruedInterest ??
            (usesZeroAccruedInterestFallback ? 0 : null)
          : data
            ? getCashFlowAccruedInterest(data.details) ??
              (usesZeroAccruedInterestFallback ? 0 : null)
            : null,
        accruedInterestMessage: usesZeroAccruedInterestFallback
          ? MISSING_NOMINAL_CURRENCY_ACCRUED_INTEREST_MESSAGE
          : historicalBuyDate
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
      ignoredCosts,
      mode,
      usesZeroAccruedInterestFallback,
    ],
  );

  const title = data?.details.shortName ?? data?.basicInfo.shortname ?? normalizedSecid;
  const bondIsin = data?.details.isin ?? data?.basicInfo.isin ?? null;
  const subtitle = bondIsin ?? normalizedSecid;
  const identifierLabel = bondIsin ? "ISIN" : "SECID";
  const dohodBondIsin = bondIsin;
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
    modeRef.current = nextMode;
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
    setEditedFields((currentFields) => new Set(currentFields).add(field));
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleManualMoexRefresh() {
    const [snapshotResult, detailsResult] = await Promise.all([
      primaryBondSnapshotQueryResult.refetch(),
      bondDetailsQuery.refetch(),
    ]);

    const freshBasicInfo = snapshotResult.data?.find(
      (bond) => bond.secid === normalizedSecid,
    );
    const freshDetails = detailsResult.data;

    if (
      !freshBasicInfo ||
      !freshDetails ||
      snapshotResult.isError ||
      detailsResult.isError
    ) {
      return;
    }

    const freshTargetDates = getTargetDates(freshBasicInfo, freshDetails);
    const offerWasRemoved =
      modeRef.current === "offer" && !freshTargetDates.offerDate;
    const nextMode = offerWasRemoved ? "maturity" : modeRef.current;

    if (offerWasRemoved) {
      setShowOfferUnavailableAlert(true);

      if (offerUnavailableTimerRef.current !== null) {
        window.clearTimeout(offerUnavailableTimerRef.current);
      }

      offerUnavailableTimerRef.current = window.setTimeout(() => {
        setShowOfferUnavailableAlert(false);
        offerUnavailableTimerRef.current = null;
      }, 1_000);
    }

    initializedSecidRef.current = normalizedSecid;
    processedDataRef.current = {
      basicInfo: freshBasicInfo,
      details: freshDetails,
    };
    modeRef.current = nextMode;
    setMode(nextMode);
    setForm((currentForm) =>
      createFormFromBond(freshBasicInfo, freshDetails, freshTargetDates, nextMode, {
        commissionPercent: currentForm.commissionPercent,
        taxPercent: currentForm.taxPercent,
      }),
    );
    setEditedFields(new Set());
    setHasPendingMoexUpdate(false);
  }

  async function handleCopyIsin(isin: string) {
    try {
      await navigator.clipboard.writeText(isin);
      setCopiedIsin(true);

      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedIsin(false);
        copyResetTimerRef.current = null;
      }, 1800);
    } catch {
      setCopiedIsin(false);
    }
  }

  return (
    <section className="space-y-6">
      {isLoading ? (
        <StateMessage
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Загружаем облигацию"
          text="Получаем параметры выпуска и ближайшие даты из MOEX ISS."
        />
      ) : isError ? (
        <StateMessage
          icon={<AlertCircle className="size-5" aria-hidden="true" />}
          title="Не удалось открыть калькулятор"
          text={getErrorMessage(error)}
          tone="danger"
        />
      ) : !data || !targetDates ? (
        <StateMessage
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Готовим калькулятор"
          text="Собираем форму из параметров облигации."
        />
      ) : (
        <>
          <div className="space-y-3">
            <header className="flex items-center justify-between gap-3">
              {cameFromSearch ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 [&_svg]:size-6"
                  onClick={() => navigate(-1)}
                  type="button"
                  aria-label="Назад к поиску"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="shrink-0 [&_svg]:size-6"
                >
                  <Link to="/" aria-label="Открыть поиск облигаций">
                    <Search className="size-5" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {isFormDirty && hasPendingMoexUpdate ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground [&_svg]:size-6"
                          onClick={() => void handleManualMoexRefresh()}
                          type="button"
                          aria-label="Обновить значения из MOEX"
                        >
                          <RefreshCw className="size-5" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Обновить значения из MOEX</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
                {externalLinks.length > 0 ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground [&_svg]:size-6"
                        aria-label="Внешние ссылки"
                      >
                        <ExternalLink className="size-5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 max-w-[calc(100vw-2rem)]">
                      {externalLinks.map((externalLink) => (
                        <DropdownMenuItem asChild key={externalLink.href}>
                          <a
                            className="cursor-pointer gap-3 text-sm font-medium text-foreground"
                            href={externalLink.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {externalLink.icon}
                            <span>{externalLink.label}</span>
                          </a>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </header>
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h1 className="min-w-0 flex-1 break-words text-2xl font-medium leading-tight tracking-normal text-foreground">
                      {title}
                    </h1>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="inline-flex max-w-full shrink-0 items-center gap-1.5 break-all text-left text-sm font-medium leading-5 tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => void handleCopyIsin(subtitle)}
                            type="button"
                            aria-label={
                              copiedIsin
                                ? `${identifierLabel} ${subtitle} скопирован`
                                : `Скопировать ${identifierLabel} ${subtitle}`
                            }
                          >
                            <span className="min-w-0 break-all">{subtitle}</span>
                            {copiedIsin ? (
                              <Check className="size-4 shrink-0" aria-hidden="true" />
                            ) : (
                              <Copy className="size-4 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {copiedIsin ? "Скопировано" : `Скопировать ${identifierLabel}`}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-base leading-5">
                  <ResultRow
                    label="погашение"
                    value={formatLocalDate(targetDates.maturityDate)}
                  />
                  <ResultRow
                    label="оферта"
                    value={formatLocalDate(targetDates.offerDate)}
                  />
                  <ResultRow
                    label="дата купона"
                    value={formatLocalDate(data.basicInfo.coupon_date)}
                  />
                  <ResultRow
                    label="купон"
                    value={formatMoney(data.basicInfo.coupon_value, data.basicInfo.face_unit)}
                  />
                </dl>
                <p className="mt-3 text-right text-xs text-muted-foreground">
                  * по данным MOEX
                </p>
              </CardContent>
            </Card>
          </div>

          <FieldSet>
            <FieldLegend className="text-xl">Параметры расчета</FieldLegend>
            <FieldGroup className="grid-cols-2 gap-4">
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
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend className="text-xl">Покупка</FieldLegend>
            <FieldGroup className="grid-cols-2 gap-4">
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
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend className="text-xl">Сценарий выхода</FieldLegend>
            <ModeToggle
              value={mode}
              onChange={handleModeChange}
              items={(Object.keys(modeLabels) as CalculatorMode[]).map((modeKey) => ({
                disabled: modeKey === "offer" && !hasOffer,
                label: modeLabels[modeKey],
                value: modeKey,
              }))}
            />
            {showOfferUnavailableAlert ? (
              <StateMessage
                title="Оферта больше не доступна"
                text="Переключили расчёт на погашение."
                tone="danger"
              />
            ) : null}
            <FieldGroup className="grid-cols-2 gap-4">
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
            </FieldGroup>
          </FieldSet>

          <ResultPanel
            title="Результаты"
            controls={
              <ToggleGroup
                aria-label="Учет налога и комиссии"
                className="grid w-full grid-cols-2 gap-2 sm:flex"
                onValueChange={setIgnoredCosts}
                type="multiple"
                value={ignoredCosts}
              >
                <ToggleGroupItem
                  aria-label="Комиссия"
                  className="rounded-md border border-input bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent data-[state=on]:border-foreground/50 data-[state=on]:bg-transparent data-[state=on]:text-foreground"
                  value="commission"
                >
                  {ignoredCosts.includes("commission")
                    ? "без комиссии"
                    : "с комиссией"}
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label="Налог"
                  className="rounded-md border border-input bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent data-[state=on]:border-foreground/50 data-[state=on]:bg-transparent data-[state=on]:text-foreground"
                  value="tax"
                >
                  {ignoredCosts.includes("tax") ? "без налога" : "с налогом"}
                </ToggleGroupItem>
              </ToggleGroup>
            }
            footer={
              calculationView.warningAlert || calculationView.warnings.length > 0 ? (
                <div className="space-y-3">
                  {calculationView.warningAlert ? (
                    <Alert variant="warning">
                      <AlertTriangle aria-hidden="true" />
                      <div className="col-start-2 w-full whitespace-pre-line font-medium">
                        {calculationView.warningAlert}
                      </div>
                    </Alert>
                  ) : null}
                  {calculationView.warnings.length > 0 ? (
                    <Alert variant="warning">
                      <AlertTriangle aria-hidden="true" />
                      <div className="col-start-2 w-full font-medium">
                        {calculationView.warnings.join(" ")}
                      </div>
                    </Alert>
                  ) : null}
                </div>
              ) : null
            }
          >
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-lg leading-6 sm:text-xl">
              {calculationView.summaryRows.map((row) => (
                <ResultRow key={row.label} {...row} />
              ))}
            </dl>
          </ResultPanel>

          {calculationView.detailSections ? (
            <ResultPanel title="Детализация">
              <div className="divide-y divide-border">
                {calculationView.detailSections.map((section) => (
                  <div className="py-4 first:pt-0 last:pb-0" key={section.title}>
                    <h3 className="text-xs font-semibold uppercase leading-5 text-muted-foreground">
                      {section.title}
                    </h3>
                    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-base leading-5">
                      {section.rows.map((row) => (
                        <ResultRow key={`${section.title}-${row.label}`} {...row} />
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </ResultPanel>
          ) : (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Детализация недоступна</AlertTitle>
            </Alert>
          )}
        </>
      )}
    </section>
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
  details: BondDetails,
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
    buyPrice: formatInputNumber(getDisplayPrice(bond, details) ?? 100),
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
  const currentYieldPercent = calculateCurrentYieldFromForm(form);
  const warningAlert =
    accruedInterestMessage === MISSING_NOMINAL_CURRENCY_ACCRUED_INTEREST_MESSAGE
      ? accruedInterestMessage
      : null;

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
    return createUnavailableCalculationView({ mode, currentYieldPercent });
  }

  if (accruedInterest === null) {
    return createUnavailableCalculationView({
      mode,
      currentYieldPercent,
      warnings: accruedInterestMessage && !warningAlert ? [accruedInterestMessage] : [],
      warningAlert,
    });
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
  const currency = bond.face_unit;

  return {
    summaryRows: createSummaryRows({ mode, currentYieldPercent, result, currency }),
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
            label: "амортизация за период",
            value: formatMoney(result.amortizationsReceived, currency),
          },
          {
            label: "НКД продажи",
            value: formatMoney(result.exitAccruedInterest, currency),
          },
          {
            label: "получено купонов",
            value: formatMoney(result.couponsReceived, currency),
          },
          {
            label: "комиссия продажи",
            value: formatMoney(result.exitCommission, currency),
          },
          {
            label: "итого получено",
            value: formatMoney(result.totalReceived, currency),
            strong: true,
          },
        ],
      },
      {
        title: "Результат и налог",
        rows: [
          {
            label: "прибыль до налога",
            value: formatMoney(result.profitBeforeTax, currency),
            valueTone: getProfitTone(result.profitBeforeTax),
          },
          { label: "налог", value: formatMoney(result.tax, currency) },
        ],
      },
    ],
    warningAlert,
    warnings: [
      ...result.warnings,
      ...createCashFlowWarnings({
        forecastCouponCount: couponProjection.forecastCount,
        forecastCouponAnnualPercent: couponProjection.forecastAnnualPercent,
        missingCouponCount: couponProjection.missingCount,
        missingAmortizationCount: amortizationProjection.missingCount,
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
  fallbackCouponPeriodDays,
}: {
  schedule: BondCouponScheduleItem[];
  amortizations: CashFlow[];
  buyDate: LocalDate;
  exitDate: LocalDate;
  currentNominal: number;
  fallbackCouponPeriodDays: number;
}): {
  cashFlows: CashFlow[];
  forecastCount: number;
  forecastAnnualPercent: number | null;
  missingCount: number;
} {
  const today = getTodayLocalDate();
  const cashFlows: CashFlow[] = [];
  let forecastCount = 0;
  let forecastAnnualPercent: number | null = null;
  let missingCount = 0;
  let lastKnownAnnualPercent: number | null = null;

  for (const coupon of schedule) {
    if (coupon.date <= buyDate) {
      if (coupon.annualPercent !== null) {
        lastKnownAnnualPercent = coupon.annualPercent;
      }

      continue;
    }

    if (coupon.date > exitDate) {
      continue;
    }

    if (coupon.amount !== null) {
      cashFlows.push({ date: coupon.date, amount: coupon.amount });
      if (coupon.annualPercent !== null) {
        lastKnownAnnualPercent = coupon.annualPercent;
      }
      continue;
    }

    const couponPeriodDays = coupon.startDate
      ? getDaysBetween(coupon.startDate, coupon.date)
      : fallbackCouponPeriodDays;

    if (
      coupon.date <= today ||
      lastKnownAnnualPercent === null ||
      lastKnownAnnualPercent <= 0 ||
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
      (nominalAtCoupon * lastKnownAnnualPercent * couponPeriodDays) / 365 / 100;

    cashFlows.push({ date: coupon.date, amount });
    forecastCount += 1;
    forecastAnnualPercent = lastKnownAnnualPercent;
  }

  return { cashFlows, forecastCount, forecastAnnualPercent, missingCount };
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
}): {
  cashFlows: CashFlow[];
  missingCount: number;
} {
  const cashFlows: CashFlow[] = [];
  let missingCount = 0;

  for (const amortization of schedule) {
    if (amortization.date <= buyDate || amortization.date > exitDate) {
      continue;
    }

    const amount =
      amortization.amount ??
      (amortization.percent === null
        ? 0
        : (currentNominal * amortization.percent) / 100);

    if (amortization.amount === null && amortization.percent === null) {
      missingCount += 1;
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
  forecastCouponAnnualPercent,
  missingCouponCount,
  missingAmortizationCount,
}: {
  forecastCouponCount: number;
  forecastCouponAnnualPercent: number | null;
  missingCouponCount: number;
  missingAmortizationCount: number;
}): string[] {
  const warnings: string[] = [];

  if (forecastCouponCount > 0 && forecastCouponAnnualPercent !== null) {
    warnings.push(
      `Будущие купоны спрогнозированы по ставке последнего известного купона ${formatInputNumber(forecastCouponAnnualPercent)}% годовых. Фактическая доходность может отличаться.`,
    );
  }

  if (missingCouponCount > 0) {
    warnings.push(`Не удалось определить сумму купонов: ${missingCouponCount}.`);
  }

  if (missingAmortizationCount > 0) {
    warnings.push(
      `Не удалось определить сумму амортизаций: ${missingAmortizationCount}. Такие амортизации учтены как 0.`,
    );
  }

  return warnings;
}

function createUnavailableCalculationView({
  mode,
  currentYieldPercent,
  warnings = [],
  warningAlert = null,
}: {
  mode: CalculatorMode;
  currentYieldPercent: number | null;
  warnings?: string[];
  warningAlert?: string | null;
}): CalculationView {
  return {
    summaryRows: createSummaryRows({ mode, currentYieldPercent }),
    detailSections: null,
    warningAlert,
    warnings,
  };
}

function createSummaryRows({
  currency,
  currentYieldPercent,
  mode,
  result,
}: {
  currency?: string;
  currentYieldPercent: number | null;
  mode: CalculatorMode;
  result?: ReturnType<typeof calculateBondTrade>;
}): CalculationRow[] {
  const annualizedReturnPercent = result?.annualizedReturnPercent ?? null;
  const annualizedXirrPercent = result?.annualizedXirrPercent ?? null;
  const profitAfterTax = result?.profitAfterTax ?? null;

  return [
    {
      label: "тек. доходность",
      value: formatPercent(currentYieldPercent),
      tooltip: CURRENT_YIELD_TOOLTIP,
      tooltipLabel: "Формула текущей доходности",
    },
    ...(mode === "sale"
      ? [
          {
            label: ANNUALIZED_PROFIT_LABEL,
            value: formatPercent(annualizedReturnPercent),
            tooltip: ANNUALIZED_PROFIT_TOOLTIP,
            strong: true,
            valueTone: getProfitTone(annualizedReturnPercent),
          },
        ]
      : [
          {
            label: XIRR_LABEL,
            value: formatPercent(annualizedXirrPercent),
            tooltip: XIRR_TOOLTIP,
            strong: true,
            valueTone: getProfitTone(annualizedXirrPercent),
          },
        ]),
    {
      label: "прибыль",
      value: result && currency ? formatMoney(profitAfterTax, currency) : "—",
      strong: true,
      valueTone: getProfitTone(profitAfterTax),
    },
    { label: "срок, дней", value: result ? formatNumber(result.holdingDays) : "—" },
  ];
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

function calculateCurrentYieldFromForm(form: CalculatorForm): number | null {
  const couponPercent = parseDecimal(form.couponPercent);
  const buyPrice = parseDecimal(form.buyPrice);
  const taxPercent = parseDecimal(form.taxPercent);

  if (couponPercent === null || buyPrice === null || taxPercent === null) {
    return null;
  }

  return calculateCurrentYieldAfterTax({
    couponPercent,
    pricePercent: buyPrice,
    taxPercent,
  });
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

function getDisplayPrice(bond: BasicBondInfo, details: BondDetails): number | null {
  const primaryBoard = details.marketBoards.find((board) => board.isPrimary);
  const snapshotPrice = bond.last_price ?? bond.prev_price;

  return (
    snapshotPrice ?? primaryBoard?.lastPrice ?? primaryBoard?.previousPrice ?? null
  );
}

function getCashFlowAccruedInterest(details: BondDetails): number | null {
  const cashFlowBoard = details.marketBoards.find(
    (board) => board.boardId === details.cashFlowBoardId,
  );

  return cashFlowBoard?.accruedInterest ?? null;
}

function isForeignCurrencyBond(bond: BasicBondInfo): boolean {
  const faceUnit = bond.face_unit.trim().toUpperCase();

  return faceUnit !== "SUR" && faceUnit !== "RUB";
}

function getProfitTone(value: number | null): "neutral" | "up" | "down" {
  if (value === null) {
    return "neutral";
  }

  if (value > 0) {
    return "up";
  }

  if (value < 0) {
    return "down";
  }

  return "neutral";
}

function formatLocalDate(value: LocalDate | null): string {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");

  return day && month && year ? `${day}.${month}.${year}` : value;
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null) {
    return "—";
  }

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
