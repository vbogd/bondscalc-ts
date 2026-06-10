import { describe, expect, it } from "vitest";
import { getBoolean, getLocalDate, getNumber, getString, normalizeIssTable } from ".";

describe("normalizeIssTable", () => {
  it("maps MOEX columns and row arrays into objects", () => {
    expect(
      normalizeIssTable({
        columns: ["SECID", "SHORTNAME", "OFFERDATE"],
        data: [["RU000A_TEST", "Тест", null]],
      }),
    ).toEqual([{ SECID: "RU000A_TEST", SHORTNAME: "Тест", OFFERDATE: null }]);
  });

  it("fills missing trailing cells with null", () => {
    expect(
      normalizeIssTable({
        columns: ["SECID", "SHORTNAME", "ISIN"],
        data: [["RU000A_TEST"]],
      }),
    ).toEqual([{ SECID: "RU000A_TEST", SHORTNAME: null, ISIN: null }]);
  });
});

describe("ISS row helpers", () => {
  it("reads cells case-insensitively and converts common MOEX values", () => {
    const row = {
      SECID: "RU000A_TEST",
      VALUE: "100,25",
      IS_TRADED: 1,
      OFFERDATE: "2027-03-15",
      EMPTYDATE: "0000-00-00",
    };

    expect(getString(row, "secid")).toBe("RU000A_TEST");
    expect(getNumber(row, "value")).toBe(100.25);
    expect(getBoolean(row, "is_traded")).toBe(true);
    expect(getLocalDate(row, "offerdate")).toBe("2027-03-15");
    expect(getLocalDate(row, "emptydate")).toBeNull();
  });
});

