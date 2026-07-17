import {
  getBoolean,
  getLocalDate,
  getNumber,
  getString,
  normalizeIssTable,
} from "./issTable";
import type {
  BasicBondInfo,
  BondAmortizationScheduleItem,
  BondBoard,
  BondCouponScheduleItem,
  BondDetails,
  BondListLevel,
  BondMarketBoard,
  BondOfferScheduleItem,
  BondSearchRef,
  HistoricalBondSnapshot,
  IssRow,
} from "./types";

export const MIN_BOND_SEARCH_QUERY_LENGTH = 3;

const BOARD_PRIORITY = [
  "TQOB", // гособлигации
  "TQCB", // облигации
  "TQIR", // облигации ПИР
  "TQOD", // облигации в USD
  "TQOE", // облигации в EUR
  "TQOY", // облигации в CNY
];

export function normalizeBondSearchRefs(rows: IssRow[]): BondSearchRef[] {
  return rows
    .map((row) => {
      const secid = getString(row, "secid");
      const shortName = getString(row, "shortname");
      const name = getString(row, "name");

      if (!secid || !shortName || !name) {
        return null;
      }

      return {
        secid,
        isin: getString(row, "isin"),
        shortName,
        name,
        primaryBoardId: getString(row, "primary_boardid"),
        marketPriceBoardId: getString(row, "marketprice_boardid"),
      };
    })
    .filter((bond) => bond !== null);
}

export function normalizeBasicBondInfoFromRows({
  rows,
  preferredBoardIds = [],
}: {
  rows: IssRow[];
  preferredBoardIds?: (string | null)[];
}): BasicBondInfo | null {
  const selectedRow = selectMarketSecurityRow(rows, preferredBoardIds);

  return selectedRow ? normalizeBasicBondInfo(selectedRow) : null;
}

export function normalizeBasicBondInfo(row: IssRow): BasicBondInfo | null {
  const shortname = getString(row, "shortname");
  const secid = getString(row, "secid");
  const isin = getString(row, "isin");
  const listLevel = getNumber(row, "listlevel");
  const couponDate = getLocalDate(row, "nextcoupon");
  const nkd = getNumber(row, "accruedint");
  const currencyId = getString(row, "currencyid");
  const faceUnit = getString(row, "faceunit");
  const faceValue = getNumber(row, "facevalue");
  const couponPeriod = getNumber(row, "couponperiod");
  const issueSize = getNumber(row, "issuesize");

  if (
    !shortname ||
    !secid ||
    !isin ||
    !isBondListLevel(listLevel) ||
    !couponDate ||
    nkd === null ||
    !currencyId ||
    !faceUnit ||
    faceValue === null ||
    couponPeriod === null ||
    issueSize === null
  ) {
    return null;
  }

  return {
    shortname,
    secid,
    isin,
    board_id: getString(row, "boardid"),
    mat_date: getLocalDate(row, "matdate"),
    coupon_percent: getNumber(row, "couponpercent"),
    list_level: listLevel,
    coupon_value: getNumber(row, "couponvalue"),
    coupon_date: couponDate,
    nkd,
    currency_id: currencyId,
    face_unit: faceUnit,
    face_value: faceValue,
    coupon_period: couponPeriod,
    issue_size: issueSize,
    offer_date: getLocalDate(row, "offerdate"),
    prev_price: getNumber(row, "prevprice"),
    last_price: getNumber(row, "last"),
    reg_number: getString(row, "regnumber"),
  };
}

export function mergeMarketDataRows({
  securityRows,
  marketDataRows,
}: {
  securityRows: IssRow[];
  marketDataRows: IssRow[];
}): IssRow[] {
  const marketDataByBoardAndSecid = new Map<string, IssRow>();

  for (const row of marketDataRows) {
    const key = getBoardSecidKey(row);

    if (key) {
      marketDataByBoardAndSecid.set(key, row);
    }
  }

  return securityRows.map((securityRow) => {
    const key = getBoardSecidKey(securityRow);
    const marketDataRow = key ? marketDataByBoardAndSecid.get(key) : undefined;

    return marketDataRow
      ? {
          ...securityRow,
          LAST: getNumber(marketDataRow, "last"),
          VALUE: getNumber(marketDataRow, "value"),
          NUMTRADES: getNumber(marketDataRow, "numtrades"),
        }
      : securityRow;
  });
}

export function normalizeBondMarketBoards({
  securityRows,
  marketDataRows,
  primaryBoardId,
}: {
  securityRows: IssRow[];
  marketDataRows: IssRow[];
  primaryBoardId: string;
}): BondMarketBoard[] {
  return mergeMarketDataRows({ securityRows, marketDataRows })
    .map((row) => {
      const boardId = getString(row, "boardid");
      const currencyId = getString(row, "currencyid");

      if (!boardId || !currencyId) {
        return null;
      }

      return {
        boardId,
        isPrimary: boardId === primaryBoardId,
        currencyId,
        accruedInterest: getNumber(row, "accruedint"),
        previousPrice: getNumber(row, "prevprice"),
        lastPrice: getNumber(row, "last"),
        value: getNumber(row, "value"),
        numberOfTrades: getNumber(row, "numtrades"),
      };
    })
    .filter((board): board is BondMarketBoard => board !== null);
}

export function selectCashFlowBondBoard({
  boards,
  faceUnit,
}: {
  boards: BondMarketBoard[];
  faceUnit: string;
}): BondMarketBoard | null {
  return (
    boards.find((board) => currenciesMatch(board.currencyId, faceUnit)) ?? null
  );
}

export function normalizeBondBoards(rows: IssRow[]): BondBoard[] {
  return rows
    .map((row) => {
      const boardId = getString(row, "boardid");

      if (!boardId) {
        return null;
      }

      return {
        boardId,
        isPrimary: getBoolean(row, "is_primary"),
        isTraded: getBoolean(row, "is_traded"),
        market: getString(row, "market"),
        engine: getString(row, "engine"),
      };
    })
    .filter((board) => board !== null);
}

export function selectBondBoardId({
  primaryBoardId,
  marketPriceBoardId,
  boards,
}: {
  primaryBoardId: string | null;
  marketPriceBoardId: string | null;
  boards: BondBoard[];
}): string | null {
  const tradableBoardIds = new Set(
    boards.filter((board) => board.isTraded).map((board) => board.boardId),
  );

  if (primaryBoardId && tradableBoardIds.has(primaryBoardId)) {
    return primaryBoardId;
  }

  if (marketPriceBoardId && tradableBoardIds.has(marketPriceBoardId)) {
    return marketPriceBoardId;
  }

  const primaryDetailsBoard = boards.find(
    (board) => board.isPrimary && board.isTraded && board.market === "bonds",
  );

  if (primaryDetailsBoard) {
    return primaryDetailsBoard.boardId;
  }

  const priorityBoardId = BOARD_PRIORITY.find((boardId) =>
    tradableBoardIds.has(boardId),
  );

  return priorityBoardId ?? boards.find((board) => board.isTraded)?.boardId ?? null;
}

export function normalizeBondOfferSchedule(rows: IssRow[]): BondOfferScheduleItem[] {
  return rows
    .map((row) => {
      const date = getLocalDate(row, "offerdate");

      if (!date) {
        return null;
      }

      return {
        date,
        pricePercent: getNumber(row, "price"),
        value: getNumber(row, "value"),
        type: getString(row, "offertype"),
      };
    })
    .filter((offer) => offer !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeBondCouponSchedule(rows: IssRow[]): BondCouponScheduleItem[] {
  return rows
    .map((row) => {
      const date = getLocalDate(row, "coupondate");

      if (!date) {
        return null;
      }

      return {
        date,
        startDate: getLocalDate(row, "startdate"),
        amount: getNumber(row, "value"),
        annualPercent: getNumber(row, "valueprc"),
      };
    })
    .filter((coupon) => coupon !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeBondAmortizationSchedule(
  rows: IssRow[],
): BondAmortizationScheduleItem[] {
  return rows
    .map((row) => {
      const date = getLocalDate(row, "amortdate");

      if (!date) {
        return null;
      }

      return {
        date,
        amount: getNumber(row, "value"),
        percent: getNumber(row, "valueprc"),
      };
    })
    .filter((amortization) => amortization !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeHistoricalBondSnapshot(
  response: unknown,
): HistoricalBondSnapshot | null {
  const row = normalizeTableFromResponse(response, "history").at(-1);

  if (!row) {
    return null;
  }

  const tradeDate = getLocalDate(row, "tradedate");
  const accruedInterest = getNumber(row, "accint");

  if (!tradeDate || accruedInterest === null) {
    return null;
  }

  return {
    tradeDate,
    accruedInterest,
    faceValue: getNumber(row, "facevalue"),
  };
}

export function normalizeBondDetails({
  secid,
  searchResult,
  primaryBoardId,
  descriptionRows,
  boardRows,
  marketSecurityRows,
  offerRows,
  couponRows = [],
  amortizationRows = [],
}: {
  secid: string;
  searchResult: BondSearchRef | null;
  primaryBoardId?: string | null;
  descriptionRows: IssRow[];
  boardRows: IssRow[];
  marketSecurityRows: IssRow[];
  offerRows: IssRow[];
  couponRows?: IssRow[];
  amortizationRows?: IssRow[];
}): BondDetails {
  const description = Object.fromEntries(
    descriptionRows
      .map((row) => [getString(row, "name"), getString(row, "value")])
      .filter((entry): entry is [string, string] => entry[0] !== null),
  );
  const boards = normalizeBondBoards(boardRows);
  const boardId = selectBondBoardId({
    primaryBoardId: primaryBoardId ?? searchResult?.primaryBoardId ?? null,
    marketPriceBoardId: searchResult?.marketPriceBoardId ?? null,
    boards,
  });

  if (!boardId) {
    throw new Error(`MOEX did not return a tradable board for ${secid}`);
  }

  const selectedMarketSecurity =
    marketSecurityRows.find((row) => getString(row, "boardid") === boardId) ??
    marketSecurityRows[0] ??
    null;
  const offerSchedule = normalizeBondOfferSchedule(offerRows);

  return {
    secid: description.SECID ?? searchResult?.secid ?? secid,
    isin: description.ISIN ?? searchResult?.isin ?? null,
    shortName:
      description.SHORTNAME ??
      searchResult?.shortName ??
      getString(selectedMarketSecurity ?? {}, "shortname") ??
      secid,
    name:
      description.NAME ??
      searchResult?.name ??
      getString(selectedMarketSecurity ?? {}, "secname") ??
      secid,
    boardId,
    marketBoards: [],
    cashFlowBoardId: null,
    maturityDate:
      getLocalDate(selectedMarketSecurity ?? {}, "matdate") ??
      normalizeDescriptionDate(description.MATDATE),
    nextOfferDate: getLocalDate(selectedMarketSecurity ?? {}, "offerdate"),
    offerSchedule,
    couponSchedule: normalizeBondCouponSchedule(couponRows),
    amortizationSchedule: normalizeBondAmortizationSchedule(amortizationRows),
  };
}

export function normalizeBondSearchRefsResponse(response: unknown): BondSearchRef[] {
  return normalizeBondSearchRefs(normalizeTableFromResponse(response, "securities"));
}

export function normalizeBasicBondInfoResponse({
  response,
  preferredBoardIds = [],
}: {
  response: unknown;
  preferredBoardIds?: (string | null)[];
}): BasicBondInfo | null {
  return normalizeBasicBondInfoFromRows({
    rows: mergeMarketDataRows({
      securityRows: normalizeTableFromResponse(response, "securities"),
      marketDataRows: normalizeTableFromResponse(response, "marketdata"),
    }),
    preferredBoardIds,
  });
}

export function normalizePrimaryBondSnapshot(response: unknown): BasicBondInfo[] {
  return mergeMarketDataRows({
    securityRows: normalizeTableFromResponse(response, "securities"),
    marketDataRows: normalizeTableFromResponse(response, "marketdata"),
  })
    .map((row) => normalizeBasicBondInfo(row))
    .filter((bond) => bond !== null);
}

export function normalizeBondDetailsResponses({
  bond,
  bondizationResponse,
  marketBoardsResponse,
}: {
  bond: BasicBondInfo;
  bondizationResponse: unknown;
  marketBoardsResponse: unknown;
}): BondDetails {
  if (!bond.board_id) {
    throw new Error(`MOEX did not return a primary board for ${bond.secid}`);
  }

  const marketBoards = normalizeBondMarketBoards({
    securityRows: normalizeTableFromResponse(marketBoardsResponse, "securities"),
    marketDataRows: normalizeTableFromResponse(marketBoardsResponse, "marketdata"),
    primaryBoardId: bond.board_id,
  });
  const cashFlowBoard = selectCashFlowBondBoard({
    boards: marketBoards,
    faceUnit: bond.face_unit,
  });

  return {
    secid: bond.secid,
    isin: bond.isin,
    shortName: bond.shortname,
    name: bond.shortname,
    boardId: bond.board_id,
    marketBoards,
    cashFlowBoardId: cashFlowBoard?.boardId ?? null,
    maturityDate: bond.mat_date,
    nextOfferDate: bond.offer_date,
    offerSchedule: normalizeBondOfferSchedule(
      normalizeTableFromResponse(bondizationResponse, "offers"),
    ),
    couponSchedule: normalizeBondCouponSchedule(
      normalizeTableFromResponse(bondizationResponse, "coupons"),
    ),
    amortizationSchedule: normalizeBondAmortizationSchedule(
      normalizeTableFromResponse(bondizationResponse, "amortizations"),
    ),
  };
}

function currenciesMatch(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toUpperCase();
  const normalizedRight = right.trim().toUpperCase();

  return (
    normalizedLeft === normalizedRight ||
    (normalizedLeft === "SUR" && normalizedRight === "RUB") ||
    (normalizedLeft === "RUB" && normalizedRight === "SUR")
  );
}

function selectMarketSecurityRow(
  rows: IssRow[],
  preferredBoardIds: (string | null)[],
): IssRow | null {
  for (const boardId of preferredBoardIds) {
    const row = rows.find((candidate) => getString(candidate, "boardid") === boardId);

    if (row) {
      return row;
    }
  }

  for (const boardId of BOARD_PRIORITY) {
    const row = rows.find((candidate) => getString(candidate, "boardid") === boardId);

    if (row) {
      return row;
    }
  }

  return rows[0] ?? null;
}

function getBoardSecidKey(row: IssRow): string | null {
  const boardId = getString(row, "boardid");
  const secid = getString(row, "secid");

  return boardId && secid ? `${boardId}:${secid}` : null;
}

function isBondListLevel(value: number | null): value is BondListLevel {
  return value === 1 || value === 2 || value === 3;
}

function normalizeTableFromResponse(response: unknown, tableName: string): IssRow[] {
  if (!response || typeof response !== "object" || !(tableName in response)) {
    return [];
  }

  return normalizeIssTable((response as Record<string, unknown>)[tableName]);
}

function normalizeDescriptionDate(value: string | undefined): string | null {
  if (!value || value === "0000-00-00") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
