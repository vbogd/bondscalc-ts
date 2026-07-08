import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MIN_BOND_SEARCH_QUERY_LENGTH,
  searchBasicBondInfo,
} from "../shared/api/moex";
import type { BasicBondInfo, LocalDate } from "../shared/api/moex";
import { loadSearchQuery, saveSearchQuery } from "../shared/persistence";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const BOND_SEARCH_DEBOUNCE_MS = 200;

export function SearchPage() {
  const [query, setQuery] = useState(loadSearchQuery);
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(
    normalizedQuery,
    BOND_SEARCH_DEBOUNCE_MS,
  );
  const canSearch = normalizedQuery.length >= MIN_BOND_SEARCH_QUERY_LENGTH;
  const canRunSearch = canSearch && debouncedQuery.length >= MIN_BOND_SEARCH_QUERY_LENGTH;
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
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm font-medium text-emerald-700">MOEX bonds</p>
        <h1 className="text-3xl font-semibold tracking-normal text-neutral-950">
          Поиск облигаций
        </h1>
      </header>

      <label className="flex h-14 items-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
        <Search className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="sr-only">Поиск</span>
        <Input
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xl text-neutral-950 shadow-none outline-none placeholder:text-neutral-400 focus-visible:border-0 focus-visible:ring-0"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="26233 или RU000A101F94"
          type="search"
          value={query}
        />
      </label>

      {!canSearch ? (
        <SearchState
          title="Введите минимум 3 символа"
          text="Можно искать по SECID, ISIN или части названия облигации."
        />
      ) : isDebouncing || isFetching ? (
        <SearchState
          icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          title="Ищем облигации"
          text="Запрашиваем данные MOEX ISS."
        />
      ) : isError ? (
        <SearchState
          icon={<AlertCircle className="size-5" aria-hidden="true" />}
          title="Не удалось загрузить поиск"
          text={getErrorMessage(error)}
          tone="danger"
        />
      ) : sortedBonds.length === 0 ? (
        <SearchState
          title="Ничего не найдено"
          text="Проверьте SECID, ISIN или попробуйте другой фрагмент названия."
        />
      ) : (
        <div className="divide-y divide-neutral-200 border-y border-neutral-200">
          {sortedBonds.map((bond) => (
            <BondSearchResult key={bond.secid} bond={bond} />
          ))}
        </div>
      )}
    </section>
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
      className="block py-5 transition-colors hover:bg-white focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
      to={`/bond/${bond.secid}`}
    >
      <article className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold text-neutral-950">
              {bond.shortname}
            </h2>
            <p className="text-base text-neutral-500">{bond.isin}</p>
          </div>
          <ListLevelBadge listLevel={bond.list_level} />
        </div>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg">
          <dt className="text-neutral-500">Погашение</dt>
          <dd className="font-medium text-neutral-950">
            {formatLocalDate(bond.mat_date)}
          </dd>
          <dt className="text-neutral-500">Дата купона</dt>
          <dd className="font-medium text-neutral-950">
            {formatLocalDate(bond.coupon_date)}
          </dd>
          <dt className="text-neutral-500">Купон</dt>
          <dd className="font-medium text-neutral-950">
            {formatMoney(bond.coupon_value, bond.face_unit)}
          </dd>
          <dt className="text-neutral-500">Ставка купона</dt>
          <dd className="font-semibold text-neutral-950">
            {formatPercent(bond.coupon_percent)}
          </dd>
          <dt className="text-neutral-500">Тек. доходность</dt>
          <dd className="font-semibold text-neutral-950">
            {formatPercent(currentYield, { fractionDigits: 2 })}
          </dd>
          <dt className="text-neutral-500">Цена</dt>
          <dd
            className={
              displayPrice !== null && displayPrice > 100
                ? "font-semibold text-red-600"
                : "font-medium text-neutral-950"
            }
          >
            {formatPrice(displayPrice)}
          </dd>
        </dl>

        {bond.offer_date ? (
          <Badge
            variant="outline"
            className="border-transparent bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700"
          >
            Оферта {formatLocalDate(bond.offer_date)}
          </Badge>
        ) : null}
      </article>
    </Link>
  );
}

function ListLevelBadge({ listLevel }: { listLevel: BasicBondInfo["list_level"] }) {
  const isSuccessLevel = listLevel === 1 || listLevel === 2;

  return (
    <Badge
      variant="outline"
      className={
        isSuccessLevel
          ? "mt-1 shrink-0 border-transparent bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700"
          : "mt-1 shrink-0 border-transparent bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700"
      }
    >
      Уровень {listLevel}
    </Badge>
  );
}

function SearchState({
  icon,
  title,
  text,
  tone = "neutral",
}: {
  icon?: ReactNode;
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
        <div className="mt-0.5 text-current">
          {icon ?? <Search className="size-5" aria-hidden="true" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-base">{text}</p>
        </div>
      </div>
    </div>
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
