import { afterEach, describe, expect, it, vi } from "vitest";
import wildcardMatch from "wildcard-match";
import type { BasicBondInfo } from "./types";

vi.mock("wildcard-match", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: typeof wildcardMatch;
  };

  return { default: vi.fn(actual.default) };
});

const wildcardMatchMock = vi.mocked(wildcardMatch);

type FetchResponse = {
  ok: true;
  json: () => Promise<unknown>;
};

describe("MOEX ISS client", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("searches bonds through the primary-board snapshot", async () => {
    const fetchMock = mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    const results = await searchBasicBondInfo("262", 2);

    expect(results.map((bond) => bond.secid)).toEqual([
      "SU26233RMFS5",
      "SU26240RMFS0",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getFetchUrl(fetchMock).pathname).toBe(
      "/iss/engines/stock/markets/bonds/securities.json",
    );
    expectIssRequest(getFetchUrl(fetchMock), {
      "iss.meta": "off",
      "iss.json": "compact",
      "iss.dp": "dot",
      "iss.only": "securities,marketdata",
      primary_board: "1",
      "securities.columns":
        "SECID,BOARDID,SHORTNAME,COUPONVALUE,NEXTCOUPON,ACCRUEDINT,PREVPRICE,FACEVALUE,MATDATE,COUPONPERIOD,ISSUESIZE,FACEUNIT,ISIN,REGNUMBER,CURRENCYID,LISTLEVEL,COUPONPERCENT,OFFERDATE",
      "marketdata.columns": "BOARDID,SECID,LAST",
    });
  });

  it("searches by SECID prefix", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    const results = await searchBasicBondInfo("SU26240");

    expect(results.map((bond) => bond.secid)).toEqual(["SU26240RMFS0"]);
  });

  it("keeps case-insensitive substring search for regular text", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("ржд")).resolves.toEqual([
      expect.objectContaining({ secid: "RU000A106A86" }),
    ]);
  });

  it("matches a glob pattern against a substring of the SECID", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("SU262*")).resolves.toEqual([
      expect.objectContaining({ secid: "SU26233RMFS5" }),
      expect.objectContaining({ secid: "SU26240RMFS0" }),
    ]);
    await expect(searchBasicBondInfo("262*")).resolves.toEqual([
      expect.objectContaining({ secid: "SU26233RMFS5" }),
      expect.objectContaining({ secid: "SU26240RMFS0" }),
    ]);
  });

  it("matches glob patterns by short name without regard to case", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("*ржд*")).resolves.toEqual([
      expect.objectContaining({ secid: "RU000A106A86" }),
    ]);
  });

  it("matches a glob pattern that starts with a wildcard as a substring", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("*сек")).resolves.toEqual([
      expect.objectContaining({ secid: "TESTWILDCARDS" }),
    ]);
  });

  it("matches one character for each question mark", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("RU000A106A8?")).resolves.toEqual([
      expect.objectContaining({ secid: "RU000A106A86" }),
    ]);
    await expect(searchBasicBondInfo("RU000A106A???")).resolves.toEqual([]);
  });

  it("treats escaped wildcard symbols as literal characters", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("*Тест секция \\*\\?*")).resolves.toEqual([
      expect.objectContaining({ secid: "TESTWILDCARDS" }),
    ]);
  });

  it("allows wildcards to match slashes", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("*Тест путь*")).resolves.toEqual([
      expect.objectContaining({ secid: "TESTSLASH" }),
    ]);
  });

  it("does not load the snapshot for underspecified or invalid glob patterns", async () => {
    const fetchMock = mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("???")).resolves.toEqual([]);
    await expect(searchBasicBondInfo("SU\\")).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("compiles a glob matcher once per search query", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await searchBasicBondInfo("SU262*");

    expect(wildcardMatchMock).toHaveBeenCalledTimes(1);
    expect(wildcardMatchMock).toHaveBeenCalledWith("*SU262**", { separator: false });
  });

  it("searches by ISIN but not registration number", async () => {
    mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("RU000A106A86")).resolves.toEqual([
      expect.objectContaining({ secid: "RU000A106A86" }),
    ]);
    await expect(searchBasicBondInfo("4B02")).resolves.toEqual([]);
  });

  it("does not load the snapshot until the query has at least 3 symbols", async () => {
    const fetchMock = mockSnapshotFetch();
    const { searchBasicBondInfo } = await import("./client");

    await expect(searchBasicBondInfo("26")).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads schedules and the selected bond's board data", async () => {
    const fetchMock = vi.fn(async (url: URL): Promise<FetchResponse> => {
      if (url.pathname.endsWith("/bondization.json")) {
        return {
          ok: true,
          json: async () => ({
            coupons: { columns: [], data: [] },
            amortizations: { columns: [], data: [] },
            offers: { columns: [], data: [] },
          }),
        };
      }

      if (
        url.pathname ===
        "/iss/engines/stock/markets/bonds/securities/RU000A_TEST.json"
      ) {
        return {
          ok: true,
          json: async () => ({
            securities: {
              columns: ["SECID", "BOARDID", "CURRENCYID", "ACCRUEDINT", "PREVPRICE"],
              data: [["RU000A_TEST", "TQCB", "SUR", 12.34, 90]],
            },
            marketdata: {
              columns: ["SECID", "BOARDID", "LAST", "VALUE", "NUMTRADES"],
              data: [["RU000A_TEST", "TQCB", 91, 1000, 2]],
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          securities: {
            columns: ["boardid", "matdate", "offerdate"],
            data: [["TQCB", "2030-05-10", "2027-05-10"]],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getBondDetails } = await import("./client");

    await expect(getBondDetails(createBasicBond())).resolves.toMatchObject({
      boardId: "TQCB",
      shortName: "Тест",
      cashFlowBoardId: "TQCB",
      marketBoards: [
        expect.objectContaining({ lastPrice: 91, accruedInterest: 12.34 }),
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bondizationUrl = getFetchUrl(fetchMock, 0);
    expect(bondizationUrl.pathname).toBe(
      "/iss/securities/RU000A_TEST/bondization.json",
    );
    expectIssRequest(bondizationUrl, {
      "iss.meta": "off",
      "iss.only": "coupons,amortizations,offers",
      limit: "unlimited",
      "coupons.columns": "coupondate,value,valueprc,startdate",
      "amortizations.columns": "amortdate,value,valueprc",
      "offers.columns": "offerdate,price,value,offertype",
    });
    const boardsUrl = getFetchUrl(fetchMock, 1);
    expect(boardsUrl.pathname).toBe(
      "/iss/engines/stock/markets/bonds/securities/RU000A_TEST.json",
    );
    expectIssRequest(boardsUrl, {
      "iss.meta": "off",
      "iss.only": "securities,marketdata",
      "securities.columns": "SECID,BOARDID,CURRENCYID,ACCRUEDINT,PREVPRICE",
      "marketdata.columns": "SECID,BOARDID,LAST,VALUE,NUMTRADES",
    });
  });

  it("loads historical bond data for an exact trading date", async () => {
    const fetchMock = vi.fn(async (_url: URL): Promise<FetchResponse> => ({
      ok: true,
      json: async () => ({
        history: {
          columns: ["TRADEDATE", "ACCINT", "FACEVALUE"],
          data: [["2026-06-15", 23.07, 1000]],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { getHistoricalBondSnapshot } = await import("./client");

    await expect(
      getHistoricalBondSnapshot({
        secid: "su26233rmfs5",
        boardId: "tqob",
        date: "2026-06-15",
      }),
    ).resolves.toEqual({
      tradeDate: "2026-06-15",
      accruedInterest: 23.07,
      faceValue: 1000,
    });

    const url = getFetchUrl(fetchMock);
    expect(url.pathname).toBe(
      "/iss/history/engines/stock/markets/bonds/boards/TQOB/securities/SU26233RMFS5.json",
    );
    expect(url.searchParams.get("from")).toBe("2026-06-15");
    expect(url.searchParams.get("till")).toBe("2026-06-15");
    expectIssRequest(url, {
      "iss.meta": "off",
      "iss.only": "history",
      "history.columns": "TRADEDATE,ACCINT,FACEVALUE",
      from: "2026-06-15",
      till: "2026-06-15",
    });
  });

  it("limits the legacy single-bond fallback to calculator fields", async () => {
    const fetchMock = vi.fn(async (url: URL): Promise<FetchResponse> => {
      const response = createSnapshotResponse();

      if (url.pathname.endsWith("/securities.json")) {
        response.securities.data = [];
        response.marketdata.data = [];
      } else {
        response.securities.data = response.securities.data.filter(
          (row) => row[0] === "SU26233RMFS5",
        );
        response.marketdata.data = response.marketdata.data.filter(
          (row) => row[1] === "SU26233RMFS5",
        );
      }

      return { ok: true, json: async () => response };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getBasicBondInfo } = await import("./client");

    await expect(getBasicBondInfo({ secid: "SU26233RMFS5" })).resolves.toMatchObject({
      secid: "SU26233RMFS5",
      last_price: 59.538,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = getFetchUrl(fetchMock, 1);
    expect(url.pathname).toBe(
      "/iss/engines/stock/markets/bonds/securities/SU26233RMFS5.json",
    );
    expectIssRequest(url, {
      "iss.meta": "off",
      "iss.only": "securities,marketdata",
      "securities.columns":
        "SECID,BOARDID,SHORTNAME,COUPONVALUE,NEXTCOUPON,ACCRUEDINT,PREVPRICE,FACEVALUE,MATDATE,COUPONPERIOD,ISSUESIZE,FACEUNIT,ISIN,REGNUMBER,CURRENCYID,LISTLEVEL,COUPONPERCENT,OFFERDATE",
      "marketdata.columns": "BOARDID,SECID,LAST",
    });
  });
});

function mockSnapshotFetch() {
  const fetchMock = vi.fn(async (_url: URL): Promise<FetchResponse> => ({
    ok: true,
    json: async () => createSnapshotResponse(),
  }));

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function getFetchUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const call = fetchMock.mock.calls[callIndex];
  const url: unknown = call?.[0];

  if (!(url instanceof URL)) {
    throw new Error("Expected fetch to be called with a URL");
  }

  return url;
}

function expectIssRequest(url: URL, params: Record<string, string>) {
  expect([...url.searchParams.entries()].sort()).toEqual(
    Object.entries(params).sort(),
  );
}

function createSnapshotResponse() {
  return {
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
          "SU26240RMFS0",
          "TQOB",
          "ОФЗ 26240",
          34.9,
          "2026-07-29",
          14.2,
          81.25,
          1000,
          "2036-07-30",
          182,
          1000000,
          "SUR",
          "RU000A105FZ9",
          "26240RMFS",
          "SUR",
          1,
          7,
          null,
        ],
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
        [
          "RU000A106A86",
          "TQCB",
          "РЖД 001P-25R",
          42.38,
          "2026-07-20",
          12.34,
          94.12,
          1000,
          "2033-03-03",
          182,
          1000000,
          "SUR",
          "RU000A106A86",
          "4B02-25-65045-D-001P",
          "SUR",
          1,
          8.5,
          "2028-03-05",
        ],
        [
          "TESTWILDCARDS",
          "TQOB",
          "Тест секция *?",
          0,
          "2026-07-20",
          0,
          100,
          1000,
          "2030-01-01",
          365,
          1000,
          "SUR",
          "RU000TESTSTAR",
          "TESTWILDCARDS",
          "SUR",
          1,
          0,
          null,
        ],
        [
          "TESTSLASH",
          "TQOB",
          "Тест путь/ещё",
          0,
          "2026-07-20",
          0,
          100,
          1000,
          "2030-01-01",
          365,
          1000,
          "SUR",
          "RU000TESTSLASH",
          "TESTSLASH",
          "SUR",
          1,
          0,
          null,
        ],
      ],
    },
    marketdata: {
      columns: ["BOARDID", "SECID", "LAST"],
      data: [
        ["TQOB", "SU26233RMFS5", 59.538],
        ["TQOB", "SU26240RMFS0", 81.7],
        ["TQCB", "RU000A106A86", 94.12],
        ["TQOB", "TESTWILDCARDS", 100],
        ["TQOB", "TESTSLASH", 100],
      ],
    },
  };
}

function createBasicBond(
  overrides: Partial<BasicBondInfo> = {},
): BasicBondInfo {
  return {
    shortname: "Тест",
    secid: "RU000A_TEST",
    isin: "RU000A000000",
    board_id: "TQCB",
    mat_date: "2030-05-10",
    coupon_percent: 10,
    list_level: 1,
    coupon_value: 50,
    coupon_date: "2026-12-15",
    nkd: 12.34,
    currency_id: "SUR",
    face_unit: "SUR",
    face_value: 1000,
    coupon_period: 182,
    issue_size: 1000,
    offer_date: "2027-05-10",
    prev_price: 100,
    last_price: 100,
    reg_number: "TEST",
    ...overrides,
  };
}
