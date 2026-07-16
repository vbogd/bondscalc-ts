import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CircleHelp, Loader2 } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { ResponsiveHint } from "@/components/ui/responsive-hint";

const BOND_SEARCH_DEBOUNCE_MS = 200;
const RELATIVE_DATE_DAYS_THRESHOLD = 60;

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
        <ItemGroup className="border-y border-border">
          {sortedBonds.map((bond, index) => (
            <Fragment key={bond.secid}>
              <BondSearchResult bond={bond} />
              {index < sortedBonds.length - 1 ? <ItemSeparator /> : null}
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

function SearchHelpTooltip() {
  return (
    <ResponsiveHint
      sideOffset={8}
      contentClassName="whitespace-pre-line"
      content={
        "Поиск осуществляется по подстроке в полях: SECID, ISIN или название.\nПример: 26233\n\nТакже поддерживается glob-паттерн. Специальные символы:\n* — любое число символов\n? — ровно один символ\n\\* и \\? — обычные * и ?\nВ паттерне нужно минимум 3 обычных символа.\nПример: гтлк*06"
      }
    >
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-6"
        type="button"
        aria-label="Как пользоваться поиском"
      >
        <CircleHelp aria-hidden="true" />
      </Button>
    </ResponsiveHint>
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
  const maturityRelative = formatRelativeLocalDate(bond.mat_date);
  const offerRelative = formatRelativeLocalDate(bond.offer_date);
  const couponRelative = formatRelativeLocalDate(bond.coupon_date);

  return (
    <div className="min-w-0" role="listitem">
      <Item
        asChild
        className="gap-x-3 gap-y-4 rounded-none px-1 py-4 active:bg-accent/70 sm:px-2"
      >
        <Link to={`/bond/${bond.secid}`}>
          <ItemContent className="self-start">
            <ItemTitle asChild>
              <h2 className="line-clamp-2 w-auto text-lg text-foreground">
                {bond.shortname}
              </h2>
            </ItemTitle>
            <ItemDescription className="line-clamp-none tabular-nums">
              {bond.isin}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="self-start">
            <ListLevelBadge listLevel={bond.list_level} />
          </ItemActions>

          <dl className="min-w-0 basis-full text-base">
            <ResultRow label="Погашение">
              <MutedValue value={maturityRelative} />
              <span>{formatLocalDate(bond.mat_date)}</span>
            </ResultRow>
            {bond.offer_date ? (
              <ResultRow label="Оферта">
                <MutedValue value={offerRelative} />
                <span>{formatLocalDate(bond.offer_date)}</span>
              </ResultRow>
            ) : null}
            <ResultRow label="Дата купона">
              <MutedValue value={couponRelative} />
              <span>{formatLocalDate(bond.coupon_date)}</span>
            </ResultRow>
            <ResultRow label="Купон">
              <MutedValue
                value={formatMoney(bond.coupon_value, bond.face_unit)}
              />
              <span>{formatPercent(bond.coupon_percent)}</span>
            </ResultRow>
            <ResultRow label="Тек. доходность">
              <span className="font-semibold">
                {formatPercent(currentYield, { fractionDigits: 2 })}
              </span>
            </ResultRow>
            <ResultRow label="Цена">
              <span
                className={
                  displayPrice !== null && displayPrice > 100
                    ? "font-medium text-destructive"
                    : "font-medium text-foreground"
                }
              >
                {formatPrice(displayPrice)}
              </span>
            </ResultRow>
          </dl>
        </Link>
      </Item>
    </div>
  );
}

function ResultRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-x-3 py-0.5 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 text-right tabular-nums text-foreground">
        {children}
      </dd>
    </div>
  );
}

function MutedValue({
  value,
}: {
  value: string | null;
}) {
  return value ? (
    <span className="text-sm text-muted-foreground">{value}</span>
  ) : null;
}

function ListLevelBadge({ listLevel }: { listLevel: BasicBondInfo["list_level"] }) {
  const isSuccessLevel = listLevel === 1 || listLevel === 2;

  return (
    <BondBadge
      className="shrink-0"
      tone={isSuccessLevel ? "up" : "warning"}
    >
      Листинг {listLevel}
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

function formatRelativeLocalDate(
  value: LocalDate | null,
  today = new Date(),
): string | null {
  const target = parseLocalDate(value);

  if (!target) {
    return null;
  }

  const current = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
  const dayDifference =
    getCalendarDayNumber(target) - getCalendarDayNumber(current);

  if (dayDifference === 0) {
    return "сегодня";
  }

  const isFuture = dayDifference > 0;
  const earlier = isFuture ? current : target;
  const later = isFuture ? target : current;
  let completeMonths =
    (later.year - earlier.year) * 12 + later.month - earlier.month;

  if (later.day < earlier.day) {
    completeMonths -= 1;
  }

  const absoluteMonths = Math.max(0, completeMonths);
  const absoluteDays = Math.abs(dayDifference);
  let duration: string;

  if (absoluteDays <= RELATIVE_DATE_DAYS_THRESHOLD) {
    duration = `${absoluteDays} дн.`;
  } else if (absoluteMonths >= 12) {
    const years = Math.floor(absoluteMonths / 12);
    const months = absoluteMonths % 12;
    duration = `${years} л.`;

    if (months > 0) {
      duration += ` ${months} мес.`;
    }
  } else if (absoluteMonths >= 1) {
    duration = `${absoluteMonths} мес.`;
  } else {
    duration = `${absoluteDays} дн.`;
  }

  return isFuture ? duration : `${duration} назад`;
}

function parseLocalDate(
  value: LocalDate | null,
): { year: number; month: number; day: number } | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getCalendarDayNumber({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
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
  return value === null ? "—" : `${formatNumber(value)} %`;
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
