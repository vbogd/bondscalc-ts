import { describe, expect, it } from "vitest";
import {
  mergeMarketDataRows,
  normalizeBasicBondInfo,
  normalizeBondAmortizationSchedule,
  normalizeBondCouponSchedule,
  normalizeBondDetails,
  normalizeHistoricalBondSnapshot,
  normalizeBondOfferSchedule,
  normalizeBondSearchRefs,
  normalizePrimaryBondSnapshot,
  selectBondBoardId,
} from ".";
import type { BondBoard } from "./types";

const tradedBoards: BondBoard[] = [
  {
    boardId: "TQCB",
    isPrimary: false,
    isTraded: true,
    market: "bonds",
    engine: "stock",
  },
  {
    boardId: "TQOB",
    isPrimary: true,
    isTraded: true,
    market: "bonds",
    engine: "stock",
  },
];

describe("normalizeBondSearchRefs", () => {
  it("normalizes lightweight MOEX search rows", () => {
    expect(
      normalizeBondSearchRefs([
        {
          secid: "SU26233RMFS5",
          shortname: "ОФЗ 26233",
          name: "ОФЗ-ПД 26233 18/07/2035",
          isin: "RU000A101F94",
          primary_boardid: "TQOB",
          marketprice_boardid: "TQOB",
        },
      ]),
    ).toEqual([
      {
        secid: "SU26233RMFS5",
        isin: "RU000A101F94",
        shortName: "ОФЗ 26233",
        name: "ОФЗ-ПД 26233 18/07/2035",
        primaryBoardId: "TQOB",
        marketPriceBoardId: "TQOB",
      },
    ]);
  });
});

describe("normalizeBasicBondInfo", () => {
  it("normalizes rich MOEX market security rows for search results", () => {
    expect(
      normalizeBasicBondInfo({
        SECID: "SU26233RMFS5",
        SHORTNAME: "ОФЗ 26233",
        ISIN: "RU000A101F94",
        MATDATE: "2035-07-18",
        COUPONPERCENT: 6.1,
        LISTLEVEL: 1,
        COUPONVALUE: 30.42,
        NEXTCOUPON: "2026-07-29",
        ACCRUEDINT: 22.4,
        CURRENCYID: "SUR",
        FACEUNIT: "SUR",
        FACEVALUE: 1000,
        COUPONPERIOD: 182,
        ISSUESIZE: 599487782,
        OFFERDATE: null,
        PREVPRICE: 59.344,
        LAST: 59.538,
        REGNUMBER: "26233RMFS",
      }),
    ).toEqual({
      shortname: "ОФЗ 26233",
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      mat_date: "2035-07-18",
      coupon_percent: 6.1,
      list_level: 1,
      coupon_value: 30.42,
      coupon_date: "2026-07-29",
      nkd: 22.4,
      currency_id: "SUR",
      face_unit: "SUR",
      face_value: 1000,
      coupon_period: 182,
      issue_size: 599487782,
      offer_date: null,
      prev_price: 59.344,
      last_price: 59.538,
      reg_number: "26233RMFS",
    });
  });
});

describe("primary bond snapshot normalization", () => {
  it("merges securities rows with marketdata rows by board and secid", () => {
    expect(
      mergeMarketDataRows({
        securityRows: [{ BOARDID: "TQOB", SECID: "SU26233RMFS5", PREVPRICE: 59.344 }],
        marketDataRows: [{ BOARDID: "TQOB", SECID: "SU26233RMFS5", LAST: 59.538 }],
      }),
    ).toEqual([
      {
        BOARDID: "TQOB",
        SECID: "SU26233RMFS5",
        PREVPRICE: 59.344,
        LAST: 59.538,
      },
    ]);
  });

  it("normalizes a bulk primary-board snapshot into BasicBondInfo rows", () => {
    expect(
      normalizePrimaryBondSnapshot({
        securities: {
          columns: [
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
          ],
          data: [
            [
              "SU26233RMFS5",
              "TQOB",
              "ОФЗ 26233",
              30.42,
              "2026-07-29",
              22.4,
              59.344,
              1000,
              "2035-07-18",
              182,
              599487782,
              "SUR",
              "RU000A101F94",
              "26233RMFS",
              "SUR",
              1,
              6.1,
              null,
            ],
          ],
        },
        marketdata: {
          columns: ["BOARDID", "SECID", "LAST"],
          data: [["TQOB", "SU26233RMFS5", 59.538]],
        },
      }),
    ).toEqual([
      expect.objectContaining({
        secid: "SU26233RMFS5",
        prev_price: 59.344,
        last_price: 59.538,
      }),
    ]);
  });
});

describe("selectBondBoardId", () => {
  it("uses primary board from search when it is tradable in details", () => {
    expect(
      selectBondBoardId({
        primaryBoardId: "TQOB",
        marketPriceBoardId: "TQCB",
        boards: tradedBoards,
      }),
    ).toBe("TQOB");
  });

  it("falls back to market price board when primary board is absent", () => {
    expect(
      selectBondBoardId({
        primaryBoardId: "MISSING",
        marketPriceBoardId: "TQCB",
        boards: tradedBoards,
      }),
    ).toBe("TQCB");
  });

  it("uses the details primary board before the priority whitelist", () => {
    expect(
      selectBondBoardId({
        primaryBoardId: null,
        marketPriceBoardId: null,
        boards: tradedBoards,
      }),
    ).toBe("TQOB");
  });

  it("uses the whitelist when MOEX does not mark a primary bond board", () => {
    expect(
      selectBondBoardId({
        primaryBoardId: null,
        marketPriceBoardId: null,
        boards: [
          { ...tradedBoards[0], isPrimary: false },
          { ...tradedBoards[1], isPrimary: false },
        ],
      }),
    ).toBe("TQOB");
  });
});

describe("normalizeBondOfferSchedule", () => {
  it("normalizes and sorts offer rows", () => {
    expect(
      normalizeBondOfferSchedule([
        { offerdate: "2028-01-20", price: 99.5, value: 995, offertype: "put" },
        { offerdate: "2027-01-20", price: null, value: null, offertype: null },
      ]),
    ).toEqual([
      { date: "2027-01-20", pricePercent: null, value: null, type: null },
      { date: "2028-01-20", pricePercent: 99.5, value: 995, type: "put" },
    ]);
  });
});

describe("bond cash flow schedule normalization", () => {
  it("normalizes coupon and amortization rows", () => {
    expect(
      normalizeBondCouponSchedule([
        {
          coupondate: "2027-01-20",
          startdate: "2026-07-20",
          value: null,
          valueprc: null,
        },
        {
          coupondate: "2026-07-20",
          startdate: "2026-01-19",
          value: 42.38,
          valueprc: 8.5,
        },
      ]),
    ).toEqual([
      {
        date: "2026-07-20",
        startDate: "2026-01-19",
        amount: 42.38,
        annualPercent: 8.5,
      },
      {
        date: "2027-01-20",
        startDate: "2026-07-20",
        amount: null,
        annualPercent: null,
      },
    ]);

    expect(
      normalizeBondAmortizationSchedule([
        { amortdate: "2030-01-01", value: 500, valueprc: 50 },
      ]),
    ).toEqual([{ date: "2030-01-01", amount: 500, percent: 50 }]);
  });

  it("normalizes historical accrued interest", () => {
    expect(
      normalizeHistoricalBondSnapshot({
        history: {
          columns: [
            "TRADEDATE",
            "ACCINT",
            "COUPONVALUE",
            "COUPONPERCENT",
            "FACEVALUE",
          ],
          data: [["2026-06-10", 22.4, 30.42, 6.1, 1000]],
        },
      }),
    ).toEqual({
      tradeDate: "2026-06-10",
      accruedInterest: 22.4,
      couponAmount: 30.42,
      couponAnnualPercent: 6.1,
      faceValue: 1000,
    });
  });
});

describe("normalizeBondDetails", () => {
  it("builds details with selected board and next offer date", () => {
    expect(
      normalizeBondDetails({
        secid: "RU000A_TEST",
        searchResult: {
          secid: "RU000A_TEST",
          isin: "RU000A000000",
          shortName: "Тест",
          name: "Тестовая облигация",
          primaryBoardId: "TQCB",
          marketPriceBoardId: "TQCB",
        },
        descriptionRows: [
          { name: "SECID", value: "RU000A_TEST" },
          { name: "ISIN", value: "RU000A000000" },
          { name: "SHORTNAME", value: "Тест" },
          { name: "NAME", value: "Тестовая облигация" },
          { name: "MATDATE", value: "2030-05-10" },
        ],
        boardRows: [
          {
            boardid: "TQCB",
            is_primary: 1,
            is_traded: 1,
            market: "bonds",
            engine: "stock",
          },
        ],
        marketSecurityRows: [
          {
            BOARDID: "TQCB",
            MATDATE: "2030-05-10",
            OFFERDATE: "2027-05-10",
          },
        ],
        offerRows: [
          {
            offerdate: "2027-05-10",
            price: 100,
            value: 1000,
            offertype: "put",
          },
        ],
      }),
    ).toEqual({
      secid: "RU000A_TEST",
      isin: "RU000A000000",
      shortName: "Тест",
      name: "Тестовая облигация",
      boardId: "TQCB",
      maturityDate: "2030-05-10",
      nextOfferDate: "2027-05-10",
      offerSchedule: [
        {
          date: "2027-05-10",
          pricePercent: 100,
          value: 1000,
          type: "put",
        },
      ],
      couponSchedule: [],
      amortizationSchedule: [],
    });
  });
});
