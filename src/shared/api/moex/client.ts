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
const PRIMARY_BOND_SNAPSHOT_TTL_MS = 60_000;
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

let primaryBondSnapshotCache:
  | {
      expiresAt: number;
      promise: Promise<BasicBondInfo[]>;
    }
  | null = null;

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
    ),
    preferredBoardIds,
  });

  if (!bond) {
    throw new Error(`MOEX did not return basic bond info for ${normalizedSecid}`);
  }

  return bond;
}

async function getPrimaryBondSnapshot(): Promise<BasicBondInfo[]> {
  const now = Date.now();

  if (primaryBondSnapshotCache && primaryBondSnapshotCache.expiresAt > now) {
    return primaryBondSnapshotCache.promise;
  }

  primaryBondSnapshotCache = {
    expiresAt: now + PRIMARY_BOND_SNAPSHOT_TTL_MS,
    promise: moexFetchJson("/engines/stock/markets/bonds/securities.json", {
      "iss.json": "compact",
      "iss.dp": "dot",
      "iss.only": "securities,marketdata",
      primary_board: "1",
      "securities.columns": PRIMARY_BOND_SECURITY_COLUMNS,
      "marketdata.columns": PRIMARY_BOND_MARKETDATA_COLUMNS,
    }).then(normalizePrimaryBondSnapshot),
  };

  return primaryBondSnapshotCache.promise;
}

export async function getBondDetails(secid: string): Promise<BondDetails> {
  const normalizedSecid = secid.trim().toUpperCase();

  const [searchResponse, securityResponse, marketResponse, bondizationResponse] =
    await Promise.all([
      moexFetchJson("/securities.json", {
        q: normalizedSecid,
        engine: "stock",
        market: "bonds",
        is_trading: "1",
      }),
      moexFetchJson(`/securities/${encodeURIComponent(normalizedSecid)}.json`),
      moexFetchJson(
        `/engines/stock/markets/bonds/securities/${encodeURIComponent(
          normalizedSecid,
        )}.json`,
      ),
      moexFetchJson(`/securities/${encodeURIComponent(normalizedSecid)}/bondization.json`, {
        "iss.only": "coupons,amortizations,offers",
        limit: "unlimited",
        "coupons.columns": "coupondate,value,valueprc,startdate",
        "amortizations.columns": "amortdate,value,valueprc",
        "offers.columns": "offerdate,price,value,offertype",
      }),
    ]);

  return normalizeBondDetailsResponses({
    secid: normalizedSecid,
    searchResponse,
    securityResponse,
    marketResponse,
    bondizationResponse,
  });
}

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
      "history.columns":
        "TRADEDATE,ACCINT,COUPONVALUE,COUPONPERCENT,FACEVALUE",
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

function searchPrimaryBondSnapshot(
  bonds: BasicBondInfo[],
  query: string,
  limit: number,
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
