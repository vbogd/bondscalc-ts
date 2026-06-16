import {
  MIN_BOND_SEARCH_QUERY_LENGTH,
  normalizeBasicBondInfoResponse,
  normalizeBondDetailsResponses,
  normalizePrimaryBondSnapshot,
} from "./bonds";
import type { BasicBondInfo, BondDetails } from "./types";

const MOEX_ISS_BASE_URL = "https://iss.moex.com/iss";
const DEFAULT_SEARCH_LIMIT = 100;
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

export async function searchBonds(
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<BasicBondInfo[]> {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < MIN_BOND_SEARCH_QUERY_LENGTH) {
    return [];
  }

  return searchPrimaryBondSnapshot(await getPrimaryBondSnapshot(), normalizedQuery, limit);
}

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

export async function searchBasicBondInfo(
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<BasicBondInfo[]> {
  return searchBonds(query, limit);
}

export async function getPrimaryBondSnapshot(): Promise<BasicBondInfo[]> {
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
      moexFetchJson(`/securities/${encodeURIComponent(normalizedSecid)}/bondization.json`),
    ]);

  return normalizeBondDetailsResponses({
    secid: normalizedSecid,
    searchResponse,
    securityResponse,
    marketResponse,
    bondizationResponse,
  });
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
  const normalizedQuery = normalizeSearchValue(query);

  return bonds
    .filter((bond) => matchesPrimaryBondSearch(bond, normalizedQuery))
    .sort((left, right) => left.shortname.localeCompare(right.shortname, "ru"))
    .slice(0, limit);
}

function matchesPrimaryBondSearch(
  bond: BasicBondInfo,
  normalizedQuery: string,
): boolean {
  const secid = normalizeSearchValue(bond.secid);
  const isin = normalizeSearchValue(bond.isin);
  const shortname = normalizeSearchValue(bond.shortname);

  return (
    secid.includes(normalizedQuery) ||
    isin.includes(normalizedQuery) ||
    shortname.includes(normalizedQuery)
  );
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleUpperCase("ru-RU");
}
