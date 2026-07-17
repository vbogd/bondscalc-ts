import wildcardMatch from "wildcard-match";
import {
  MIN_BOND_SEARCH_QUERY_LENGTH,
  normalizeBasicBondInfoResponse,
  normalizeBondDetailsResponses,
  normalizeHistoricalBondSnapshot,
  normalizePrimaryBondSnapshot,
} from "./bonds";
import type { BasicBondInfo, BondDetails, HistoricalBondSnapshot, LocalDate } from "./types";

const MOEX_ISS_BASE_URL = "https://iss.moex.com/iss";
const DEFAULT_SEARCH_LIMIT = 100;
const MAX_BOND_SEARCH_QUERY_LENGTH = 100;
const PRIMARY_BOND_SECURITY_COLUMNS = [
  "SECID",
  "BOARDID",
  "SHORTNAME",
  "COUPONVALUE",
  "NEXTCOUPON",
  "ACCRUEDINT",
  "PREVPRICE",
  "FACEVALUE",
  "MATDATE",
  "COUPONPERIOD",
  "ISSUESIZE",
  "FACEUNIT",
  "ISIN",
  "REGNUMBER",
  "CURRENCYID",
  "LISTLEVEL",
  "COUPONPERCENT",
  "OFFERDATE",
].join(",");
const PRIMARY_BOND_MARKETDATA_COLUMNS = ["BOARDID", "SECID", "LAST"].join(",");
const BOND_MARKET_BOARD_SECURITY_COLUMNS = [
  "SECID",
  "BOARDID",
  "CURRENCYID",
  "ACCRUEDINT",
  "PREVPRICE",
].join(",");
const BOND_MARKET_BOARD_MARKETDATA_COLUMNS = [
  "SECID",
  "BOARDID",
  "LAST",
  "VALUE",
  "NUMTRADES",
].join(",");

/**
 * Loads the complete primary-board bond snapshot for local search and calculator defaults.
 * It requests only securities calculator/search fields and marketdata BOARDID, SECID, LAST;
 * the result is deliberately uncached because React Query owns freshness and deduplication.
 */
export async function getPrimaryBondSnapshot(): Promise<BasicBondInfo[]> {
  return moexFetchJson("/engines/stock/markets/bonds/securities.json", {
    "iss.json": "compact",
    "iss.dp": "dot",
    "iss.only": "securities,marketdata",
    primary_board: "1",
    "securities.columns": PRIMARY_BOND_SECURITY_COLUMNS,
    "marketdata.columns": PRIMARY_BOND_MARKETDATA_COLUMNS,
  }).then(normalizePrimaryBondSnapshot);
}

/**
 * Loads the primary-board snapshot and filters it for callers outside React Query.
 * SearchPage uses searchPrimaryBondSnapshot instead so filtering never triggers HTTP.
 */
export async function searchBasicBondInfo(
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<BasicBondInfo[]> {
  const normalizedQuery = query.trim();

  if (!isBondSearchQueryValid(normalizedQuery)) {
    return [];
  }

  return searchPrimaryBondSnapshot(await getPrimaryBondSnapshot(), normalizedQuery, limit);
}

/**
 * Checks whether a query has enough ordinary characters for a local bond search.
 * It accepts the same escaped glob syntax used by SearchPage.
 */
export function isBondSearchQueryValid(query: string): boolean {
  const normalizedQuery = query.trim();
  const pattern = parseGlobPattern(normalizedQuery);

  return (
    normalizedQuery.length <= MAX_BOND_SEARCH_QUERY_LENGTH &&
    pattern !== null &&
    pattern.ordinaryCharacterCount >= MIN_BOND_SEARCH_QUERY_LENGTH
  );
}

export { MAX_BOND_SEARCH_QUERY_LENGTH };

/**
 * Loads one bond's basic data, preferring the primary-board snapshot for legacy callers.
 * Its fallback requests only securities calculator fields and marketdata BOARDID, SECID, LAST
 * when the shared snapshot has no matching SECID.
 */
export async function getBasicBondInfo({
  secid,
  preferredBoardIds = [],
}: {
  secid: string;
  preferredBoardIds?: (string | null)[];
}): Promise<BasicBondInfo> {
  const normalizedSecid = secid.trim().toUpperCase();
  const snapshotBond = (await getPrimaryBondSnapshot()).find(
    (bond) => bond.secid === normalizedSecid,
  );

  if (snapshotBond) {
    return snapshotBond;
  }

  const bond = normalizeBasicBondInfoResponse({
    response: await moexFetchJson(
      `/engines/stock/markets/bonds/securities/${encodeURIComponent(
        normalizedSecid,
      )}.json`,
      {
        "iss.only": "securities,marketdata",
        "securities.columns": PRIMARY_BOND_SECURITY_COLUMNS,
        "marketdata.columns": PRIMARY_BOND_MARKETDATA_COLUMNS,
      },
    ),
    preferredBoardIds,
  });

  if (!bond) {
    throw new Error(`MOEX did not return basic bond info for ${normalizedSecid}`);
  }

  return bond;
}

/**
 * Loads schedules and board-specific calculator data for one bond.
 * Prices and liquidity remain on the primary board, while accrued interest is selected later
 * from the board whose settlement currency matches FACEUNIT; no currency conversion is made.
 */
export async function getBondDetails(bond: BasicBondInfo): Promise<BondDetails> {
  const normalizedSecid = bond.secid.trim().toUpperCase();
  const [bondizationResponse, marketBoardsResponse] = await Promise.all([
    moexFetchJson(`/securities/${encodeURIComponent(normalizedSecid)}/bondization.json`, {
      "iss.only": "coupons,amortizations,offers",
      limit: "unlimited",
      "coupons.columns": "coupondate,value,valueprc,startdate",
      "amortizations.columns": "amortdate,value,valueprc",
      "offers.columns": "offerdate,price,value,offertype",
    }),
    moexFetchJson(
      `/engines/stock/markets/bonds/securities/${encodeURIComponent(normalizedSecid)}.json`,
      {
        "iss.only": "securities,marketdata",
        "securities.columns": BOND_MARKET_BOARD_SECURITY_COLUMNS,
        "marketdata.columns": BOND_MARKET_BOARD_MARKETDATA_COLUMNS,
      },
    ),
  ]);

  return normalizeBondDetailsResponses({
    bond: { ...bond, secid: normalizedSecid },
    bondizationResponse,
    marketBoardsResponse,
  });
}

/**
 * Loads TRADEDATE, ACCINT, and FACEVALUE for one bond on an exact historical trading date.
 * The calculator uses it only when the user chooses a past purchase date.
 */
export async function getHistoricalBondSnapshot({
  secid,
  boardId,
  date,
}: {
  secid: string;
  boardId: string;
  date: LocalDate;
}): Promise<HistoricalBondSnapshot> {
  const normalizedSecid = secid.trim().toUpperCase();
  const normalizedBoardId = boardId.trim().toUpperCase();
  const response = await moexFetchJson(
    `/history/engines/stock/markets/bonds/boards/${encodeURIComponent(
      normalizedBoardId,
    )}/securities/${encodeURIComponent(normalizedSecid)}.json`,
    {
      from: date,
      till: date,
      "iss.only": "history",
      "history.columns": "TRADEDATE,ACCINT,FACEVALUE",
    },
  );
  const snapshot = normalizeHistoricalBondSnapshot(response);

  if (!snapshot) {
    throw new Error(`MOEX не вернула данные торгов за ${date}.`);
  }

  return snapshot;
}

async function moexFetchJson(
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${MOEX_ISS_BASE_URL}${path}`);

  url.searchParams.set("iss.meta", "off");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`MOEX request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Filters an already loaded primary-board snapshot for local substring or glob search.
 * It performs no network request and returns at most the requested number of bonds.
 */
export function searchPrimaryBondSnapshot(
  bonds: BasicBondInfo[],
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): BasicBondInfo[] {
  const searchQuery = getBondSearchQuery(query);

  if (!searchQuery) {
    return [];
  }

  return bonds
    .filter((bond) => matchesPrimaryBondSearch(bond, searchQuery))
    .sort((left, right) => left.shortname.localeCompare(right.shortname, "ru"))
    .slice(0, limit);
}

function matchesPrimaryBondSearch(
  bond: BasicBondInfo,
  query: BondSearchQuery,
): boolean {
  const secid = normalizeSearchValue(bond.secid);
  const isin = normalizeSearchValue(bond.isin);
  const shortname = normalizeSearchValue(bond.shortname);

  return query.matches(secid) || query.matches(isin) || query.matches(shortname);
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleUpperCase("ru-RU");
}

type BondSearchQuery = {
  matches: (value: string) => boolean;
};

function getBondSearchQuery(query: string): BondSearchQuery | null {
  const pattern = parseGlobPattern(query);

  if (!pattern || pattern.ordinaryCharacterCount < MIN_BOND_SEARCH_QUERY_LENGTH) {
    return null;
  }

  const normalizedPattern = normalizeSearchValue(query);

  if (!pattern.hasGlobSyntax) {
    return {
      matches: (value) => value.includes(normalizedPattern),
    };
  }

  const matches = wildcardMatch(`*${normalizedPattern}*`, { separator: false });

  return { matches };
}

function parseGlobPattern(pattern: string): {
  hasGlobSyntax: boolean;
  ordinaryCharacterCount: number;
} | null {
  let hasGlobSyntax = false;
  let ordinaryCharacterCount = 0;

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*" || character === "?") {
      hasGlobSyntax = true;
      continue;
    }

    if (character === "\\") {
      hasGlobSyntax = true;
      const escapedCharacter = pattern[index + 1];

      if (
        escapedCharacter !== "*" &&
        escapedCharacter !== "?" &&
        escapedCharacter !== "\\"
      ) {
        return null;
      }

      ordinaryCharacterCount += 1;
      index += 1;
      continue;
    }

    ordinaryCharacterCount += 1;
  }

  return { hasGlobSyntax, ordinaryCharacterCount };
}
