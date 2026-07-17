import { describe, expect, it } from "vitest";
import {
  getBasicBondInfo,
  getBondDetails,
  getHistoricalBondSnapshot,
  searchBasicBondInfo,
} from ".";

const foreignCurrencyBonds = [
  {
    secid: "RU000A10F728",
    faceUnit: "CNY",
    maturityDate: "2030-04-29",
    expectedCashFlowCurrency: "CNY",
  },
  {
    secid: "RU000A105BY1",
    faceUnit: "EUR",
    maturityDate: "2028-11-17",
    expectedCashFlowCurrency: null,
  },
] as const;

describe("MOEX ISS client integration", () => {
  it("merges live search results with the primary-board snapshot", async () => {
    const results = await searchBasicBondInfo("SU26233");
    const bond = results.find((item) => item.secid === "SU26233RMFS5");

    expect(bond).toMatchObject({
      shortname: "ОФЗ 26233",
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      mat_date: "2035-07-18",
      coupon_percent: 6.1,
      list_level: 1,
      coupon_date: "2026-07-29",
      currency_id: "SUR",
      face_unit: "SUR",
      face_value: 1000,
      coupon_period: 182,
      issue_size: 599487782,
    });
    expect(bond?.nkd).toEqual(expect.any(Number));
    expect(bond?.last_price).toEqual(expect.any(Number));
  });

  it("loads live basic bond info from the primary-board snapshot", async () => {
    const bond = await getBasicBondInfo({
      secid: "SU26233RMFS5",
      preferredBoardIds: ["TQOB"],
    });

    expect(bond).toMatchObject({
      shortname: "ОФЗ 26233",
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      mat_date: "2035-07-18",
      coupon_percent: 6.1,
      list_level: 1,
      coupon_date: "2026-07-29",
      currency_id: "SUR",
      face_unit: "SUR",
      face_value: 1000,
      coupon_period: 182,
      issue_size: 599487782,
    });
    expect(bond.nkd).toEqual(expect.any(Number));
    expect(bond.last_price).toEqual(expect.any(Number));
  });

  it("can run a bounded rich search when the caller opts in", async () => {
    const results = await searchBasicBondInfo("SU26233", 1);

    expect(results).toHaveLength(1);
    expect(results[0]?.secid).toBe("SU26233RMFS5");
  });

  it("loads live bond details with board and maturity data", async () => {
    const bond = await getBasicBondInfo({ secid: "SU26233RMFS5" });
    const details = await getBondDetails(bond);

    expect(details).toMatchObject({
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      shortName: "ОФЗ 26233",
      boardId: "TQOB",
      maturityDate: "2035-07-18",
    });
    expect(Array.isArray(details.offerSchedule)).toBe(true);
    expect(details.couponSchedule.length).toBeGreaterThan(20);
    expect(Array.isArray(details.amortizationSchedule)).toBe(true);
  });

  it("loads historical accrued interest for a trading date", async () => {
    const snapshot = await getHistoricalBondSnapshot({
      secid: "SU26233RMFS5",
      boardId: "TQOB",
      date: "2026-06-15",
    });

    expect(snapshot).toMatchObject({
      tradeDate: "2026-06-15",
      accruedInterest: expect.any(Number),
      faceValue: 1000,
    });
  });

  it("loads the live calculator payload for a selected bond", async () => {
    const bond = await getBasicBondInfo({ secid: "SU26233RMFS5" });
    const details = await getBondDetails(bond);

    expect(bond).toMatchObject({
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      face_value: 1000,
      mat_date: "2035-07-18",
    });
    expect(details).toMatchObject({
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      boardId: "TQOB",
      maturityDate: "2035-07-18",
    });
    expect(bond.nkd).toEqual(expect.any(Number));
    expect(bond.coupon_percent).toEqual(expect.any(Number));
  });

  it("uses the primary-board price and USD accrued interest for RU000A107B43", async () => {
    const bond = await getBasicBondInfo({ secid: "RU000A107B43" });
    const details = await getBondDetails(bond);
    const primaryBoard = details.marketBoards.find((board) => board.isPrimary);
    const cashFlowBoard = details.marketBoards.find(
      (board) => board.boardId === details.cashFlowBoardId,
    );

    expect(bond).toMatchObject({ board_id: "TQCB", face_unit: "USD" });
    expect(primaryBoard).toMatchObject({
      boardId: "TQCB",
      currencyId: "SUR",
      lastPrice: expect.any(Number),
    });
    expect(cashFlowBoard).toMatchObject({
      currencyId: "USD",
      accruedInterest: expect.any(Number),
    });
  });

  it.each(foreignCurrencyBonds)(
    "uses safe board data for $faceUnit bond $secid",
    async ({ secid, faceUnit, maturityDate, expectedCashFlowCurrency }) => {
      const bond = await getBasicBondInfo({ secid });
      const details = await getBondDetails(bond);
      const primaryBoard = details.marketBoards.find((board) => board.isPrimary);
      const cashFlowBoard = details.marketBoards.find(
        (board) => board.boardId === details.cashFlowBoardId,
      );

      expect(bond).toMatchObject({
        secid,
        face_unit: faceUnit,
        mat_date: maturityDate,
      });
      expect(primaryBoard?.lastPrice ?? primaryBoard?.previousPrice).toEqual(
        expect.any(Number),
      );
      if (expectedCashFlowCurrency) {
        expect(cashFlowBoard).toMatchObject({
          currencyId: expectedCashFlowCurrency,
          accruedInterest: expect.any(Number),
        });
      } else {
        expect(details.cashFlowBoardId).toBeNull();
        expect(cashFlowBoard).toBeUndefined();
      }
    },
  );
});
