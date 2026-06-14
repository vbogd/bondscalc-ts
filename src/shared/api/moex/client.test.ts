import { afterEach, describe, expect, it, vi } from "vitest";

type FetchResponse = {
  ok: true;
  json: () => Promise<unknown>;
};

describe("MOEX ISS client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("searches bonds through the primary-board snapshot", async () => {
    const fetchMock = mockSnapshotFetch();
    const { searchBonds } = await import("./client");

    const results = await searchBonds("262", 2);

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
    const { searchBonds } = await import("./client");

    const results = await searchBonds("SU26240");

    expect(results.map((bond) => bond.secid)).toEqual(["SU26240RMFS0"]);
  });

  it("searches by ISIN but not registration number", async () => {
    mockSnapshotFetch();
    const { searchBonds } = await import("./client");

    await expect(searchBonds("RU000A106A86")).resolves.toEqual([
      expect.objectContaining({ secid: "RU000A106A86" }),
    ]);
    await expect(searchBonds("4B02")).resolves.toEqual([]);
  });

  it("does not load the snapshot until the query has at least 3 symbols", async () => {
    const fetchMock = mockSnapshotFetch();
    const { searchBonds } = await import("./client");

    await expect(searchBonds("26")).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
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

function getFetchUrl(fetchMock: ReturnType<typeof mockSnapshotFetch>) {
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
      ],
    },
    marketdata: {
      columns: ["BOARDID", "SECID", "LAST"],
      data: [
        ["TQOB", "SU26233RMFS5", 59.538],
        ["TQOB", "SU26240RMFS0", 81.7],
        ["TQCB", "RU000A106A86", 94.12],
      ],
    },
  };
}
