import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CircleHelp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  isBondSearchQueryValid,
  MAX_BOND_SEARCH_QUERY_LENGTH,
  searchBasicBondInfo,
} from "../shared/api/moex";
import type { BasicBondInfo, LocalDate } from "../shared/api/moex";
import { loadSearchQuery, saveSearchQuery } from "../shared/persistence";
import { BondBadge, SearchInput, StateMessage } from "../shared/ui/FinancialUi";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const BOND_SEARCH_DEBOUNCE_MS = 200;

export function SearchPage() {
  const [query, setQuery] = useState(loadSearchQuery);
  const normalizedQuery = query.trim();
  const hasGlobSyntax = /[*?\\]/.test(normalizedQuery);
  const debouncedQuery = useDebouncedValue(
    normalizedQuery,
    BOND_SEARCH_DEBOUNCE_MS,
  );
  const canSearch = isBondSearchQueryValid(normalizedQuery);
  const canRunSearch = canSearch && isBondSearchQueryValid(debouncedQuery);
  const isDebouncing = canSearch && normalizedQuery !== debouncedQuery;
  const {
    data: bonds = [],
    error,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ["bond-search", debouncedQuery],
    queryFn: () => searchBasicBondInfo(debouncedQuery),
    enabled: canRunSearch,
  });
  const sortedBonds = [...bonds].sort((left, right) =>
    left.shortname.localeCompare(right.shortname, "ru"),
  );

  useEffect(() => {
    saveSearchQuery(query);
  }, [query]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">MOEX bonds</p>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-medium tracking-normal text-foreground">
            Поиск облигаций
          </h1>
          <SearchHelpTooltip />
        </div>
      </header>

      <SearchInput
        maxLength={MAX_BOND_SEARCH_QUERY_LENGTH}
        onChange={setQuery}
        placeholder="26233 или RU000A101F94"
        value={query}
      />

      {!canSearch ? (
        <StateMessage
          title={
            hasGlobSyntax
              ? "В glob-паттерне нужны 3 обычных символа"
              : "Введите минимум 3 символа"
          }
          text={
            hasGlobSyntax
              ? "Символы *, ? и \\ не считаются. Обратная косая черта экранирует только *, ? или \\."
              : "Можно искать по SECID, ISIN или части названия облигации."
          }
        />
      ) : isDebouncing || isFetching ? (
        <StateMessage
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Ищем облигации"
          text="Запрашиваем данные MOEX ISS."
        />
      ) : isError ? (
        <StateMessage
          icon={<AlertCircle className="size-5" aria-hidden="true" />}
          title="Не удалось загрузить поиск"
          text={getErrorMessage(error)}
          tone="danger"
        />
      ) : sortedBonds.length === 0 ? (
        <StateMessage
          title="Ничего не найдено"
          text="Проверьте SECID, ISIN или попробуйте другой фрагмент названия."
        />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {sortedBonds.map((bond) => (
            <BondSearchResult key={bond.secid} bond={bond} />
          ))}
        </div>
      )}
    </section>
  );
}

function SearchHelpTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-6"
            type="button"
            aria-label="Как пользоваться поиском"
          >
            <CircleHelp aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="whitespace-pre-line">
          {"Поиск осуществляется по подстроке в полях: SECID, ISIN или название.\nПример: 26233\n\nТакже поддерживается glob-паттерн. Специальные символы:\n* — любое число символов\n? — ровно один символ\n\\* и \\? — обычные * и ?\nВ паттерне нужно минимум 3 обычных символа.\nПример: гтлк*06"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function BondSearchResult({ bond }: { bond: BasicBondInfo }) {
  const displayPrice = getDisplayPrice(bond);
  const currentYield = getCurrentYieldPercent({
    couponPercent: bond.coupon_percent,
    price: displayPrice,
  });

  return (
    <Link
      className="block py-5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      to={`/bond/${bond.secid}`}
    >
      <article className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium text-foreground sm:text-2xl">
              {bond.shortname}
            </h2>
            <p className="truncate text-sm tabular-nums text-muted-foreground sm:text-base">
              {bond.isin}
            </p>
          </div>
          <ListLevelBadge listLevel={bond.list_level} />
        </div>

        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-base sm:text-lg">
          <dt className="text-muted-foreground">Погашение</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">
            {formatLocalDate(bond.mat_date)}
          </dd>
          <dt className="text-muted-foreground">Дата купона</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">
            {formatLocalDate(bond.coupon_date)}
          </dd>
          <dt className="text-muted-foreground">Купон</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">
            {formatMoney(bond.coupon_value, bond.face_unit)}
          </dd>
          <dt className="text-muted-foreground">Ставка купона</dt>
          <dd className="text-right font-semibold tabular-nums text-foreground">
            {formatPercent(bond.coupon_percent)}
          </dd>
          <dt className="text-muted-foreground">Тек. доходность</dt>
          <dd className="text-right font-semibold tabular-nums text-foreground">
            {formatPercent(currentYield, { fractionDigits: 2 })}
          </dd>
          <dt className="text-muted-foreground">Цена</dt>
          <dd
            className={
              displayPrice !== null && displayPrice > 100
                ? "text-right font-semibold tabular-nums text-destructive"
                : "text-right font-medium tabular-nums text-foreground"
            }
          >
            {formatPrice(displayPrice)}
          </dd>
        </dl>

        {bond.offer_date ? (
          <BondBadge>Оферта {formatLocalDate(bond.offer_date)}</BondBadge>
        ) : null}
      </article>
    </Link>
  );
}

function ListLevelBadge({ listLevel }: { listLevel: BasicBondInfo["list_level"] }) {
  const isSuccessLevel = listLevel === 1 || listLevel === 2;

  return (
    <BondBadge
      className="mt-1 shrink-0"
      tone={isSuccessLevel ? "up" : "warning"}
    >
      Уровень {listLevel}
    </BondBadge>
  );
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

  return `${formatNumber(value)} ${formatCurrencyUnit(currency)}`;
}

function formatPercent(
  value: number | null,
  options: { fractionDigits?: number } = {},
): string {
  return value === null ? "—" : `${formatNumber(value, options)} %`;
}

function formatPrice(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

function getDisplayPrice(bond: BasicBondInfo): number | null {
  return bond.last_price ?? bond.prev_price;
}

function getCurrentYieldPercent({
  couponPercent,
  price,
}: {
  couponPercent: number | null;
  price: number | null;
}): number | null {
  if (couponPercent === null || price === null || price <= 0) {
    return null;
  }

  return (couponPercent * 100) / price;
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
