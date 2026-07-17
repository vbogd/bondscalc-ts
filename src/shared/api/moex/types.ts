export type LocalDate = string;

export type IssCellValue = string | number | boolean | null;

export type IssRow = Record<string, IssCellValue>;

export type BondListLevel = 1 | 2 | 3;

export type BondSearchRef = {
  secid: string;
  isin: string | null;
  shortName: string;
  name: string;
  primaryBoardId: string | null;
  marketPriceBoardId: string | null;
};

export type BasicBondInfo = {
  shortname: string;
  secid: string;
  isin: string;
  // MOEX: BOARDID, primary board for rows from the shared snapshot
  board_id: string | null;
  // MOEX: MATDATE
  mat_date: LocalDate | null;
  // MOEX: COUPONPERCENT
  coupon_percent: number | null;
  // MOEX: LISTLEVEL
  // values: 1, 2 or 3
  list_level: BondListLevel;
  // MOEX: COUPONVALUE, 0 if unknown, Сумма купона, в валюте номинала
  coupon_value: number | null;
  // MOEX: NEXTCOUPON
  coupon_date: LocalDate;
  // MOEX: ACCRUEDINT, НКД на дату расчетов, в валюте расчетов
  nkd: number;
  // MOEX: CURRENCYID, Валюта, в которой проводятся расчеты по сделкам
  currency_id: string;
  // MOEX: FACEUNIT, Валюта номинала
  face_unit: string;
  // MOEX: FACEVALUE
  face_value: number;
  // MOEX: COUPONPERIOD, Длительность купона
  coupon_period: number;
  // MOEX: ISSUESIZE, Объем выпуска, штук
  issue_size: number;
  // MOEX: OFFERDATE, may be ''
  offer_date: LocalDate | null;
  // MOEX: PREVPRICE
  prev_price: number | null;
  // MOEX marketdata: LAST
  last_price: number | null;
  // MOEX: REGNUMBER
  reg_number: string | null;
  // NOTE: update search normalization when adding more columns
};

export type BondBoard = {
  boardId: string;
  isPrimary: boolean;
  isTraded: boolean;
  market: string | null;
  engine: string | null;
};

export type BondMarketBoard = {
  // MOEX: BOARDID
  boardId: string;
  // Derived from the shared primary-board snapshot.
  isPrimary: boolean;
  // MOEX: CURRENCYID, trade settlement currency for this board.
  currencyId: string;
  // MOEX: ACCRUEDINT, accrued interest in this board's settlement currency.
  accruedInterest: number | null;
  // MOEX: PREVPRICE and marketdata LAST, both quoted on this board.
  previousPrice: number | null;
  lastPrice: number | null;
  // MOEX marketdata: VALUE and NUMTRADES, used for liquidity display when needed.
  value: number | null;
  numberOfTrades: number | null;
};

export type BondOfferScheduleItem = {
  date: LocalDate;
  pricePercent: number | null;
  value: number | null;
  type: string | null;
};

export type BondCouponScheduleItem = {
  date: LocalDate;
  startDate: LocalDate | null;
  amount: number | null;
  annualPercent: number | null;
};

export type BondAmortizationScheduleItem = {
  date: LocalDate;
  amount: number | null;
  percent: number | null;
};

export type HistoricalBondSnapshot = {
  tradeDate: LocalDate;
  accruedInterest: number;
  faceValue: number | null;
};

export type BondDetails = {
  secid: string;
  isin: string | null;
  shortName: string;
  name: string;
  boardId: string;
  marketBoards: BondMarketBoard[];
  // Board whose settlement currency matches FACEUNIT; its accrued interest is safe
  // to combine with the bond's nominal, coupons, and amortizations.
  cashFlowBoardId: string | null;
  maturityDate: LocalDate | null;
  nextOfferDate: LocalDate | null;
  offerSchedule: BondOfferScheduleItem[];
  couponSchedule: BondCouponScheduleItem[];
  amortizationSchedule: BondAmortizationScheduleItem[];
};
