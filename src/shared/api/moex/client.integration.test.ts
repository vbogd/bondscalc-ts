import { describe, expect, it } from "vitest";
import {
  getBasicBondInfo,
  getBondDetails,
  searchBondRefs,
  searchBonds,
  searchBasicBondInfo,
} from ".";

describe("MOEX ISS client integration", () => {
  it("finds Russian bonds through the live ISS search endpoint", async () => {
    const results = await searchBondRefs("SU26233");

    expect(results).toContainEqual(
      expect.objectContaining({
        secid: "SU26233RMFS5",
        isin: "RU000A101F94",
        shortName: "ОФЗ 26233",
        primaryBoardId: "TQOB",
      }),
    );
  });

  it("merges live search results with the primary-board snapshot", async () => {
    const results = await searchBonds("SU26233");
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
    const details = await getBondDetails("SU26233RMFS5");

    expect(details).toMatchObject({
      secid: "SU26233RMFS5",
      isin: "RU000A101F94",
      shortName: "ОФЗ 26233",
      boardId: "TQOB",
      maturityDate: "2035-07-18",
    });
    expect(Array.isArray(details.offerSchedule)).toBe(true);
  });
});
