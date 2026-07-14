import { afterEach, describe, expect, it, vi } from "vitest";
import wildcardMatch from "wildcard-match";

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

  it("loads historical bond data for an exact trading date", async () => {
    const fetchMock = vi.fn(async (_url: URL): Promise<FetchResponse> => ({
      ok: true,
      json: async () => ({
        history: {
          columns: [
            "TRADEDATE",
            "ACCINT",
            "COUPONVALUE",
            "COUPONPERCENT",
            "FACEVALUE",
          ],
          data: [["2026-06-15", 23.07, 30.42, 6.1, 1000]],
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
      couponAmount: 30.42,
      couponAnnualPercent: 6.1,
      faceValue: 1000,
    });

    const url = getFetchUrl(fetchMock);
    expect(url.pathname).toBe(
      "/iss/history/engines/stock/markets/bonds/boards/TQOB/securities/SU26233RMFS5.json",
    );
    expect(url.searchParams.get("from")).toBe("2026-06-15");
    expect(url.searchParams.get("till")).toBe("2026-06-15");
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

function getFetchUrl(fetchMock: ReturnType<typeof vi.fn>) {
  const firstCall = fetchMock.mock.calls[0];
  const url: unknown = firstCall?.[0];

  if (!(url instanceof URL)) {
    throw new Error("Expected fetch to be called with a URL");
  }

  return url;
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
