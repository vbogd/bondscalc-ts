import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrimaryBondSnapshot } from "./client";
import {
  PRIMARY_BOND_SNAPSHOT_QUERY_KEY,
  PRIMARY_BOND_SNAPSHOT_STALE_TIME_MS,
  primaryBondSnapshotQuery,
} from "./queries";

vi.mock("./client", () => ({
  getPrimaryBondSnapshot: vi.fn(),
}));

const getPrimaryBondSnapshotMock = vi.mocked(getPrimaryBondSnapshot);

describe("primary bond snapshot query", () => {
  afterEach(() => {
    vi.useRealTimers();
    getPrimaryBondSnapshotMock.mockReset();
  });

  it("deduplicates concurrent consumers and reloads after 30 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-17T00:00:00Z"));
    getPrimaryBondSnapshotMock.mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await Promise.all([
      queryClient.fetchQuery(primaryBondSnapshotQuery),
      queryClient.fetchQuery(primaryBondSnapshotQuery),
    ]);

    expect(primaryBondSnapshotQuery.queryKey).toEqual(
      PRIMARY_BOND_SNAPSHOT_QUERY_KEY,
    );
    expect(primaryBondSnapshotQuery.staleTime).toBe(
      PRIMARY_BOND_SNAPSHOT_STALE_TIME_MS,
    );
    expect(getPrimaryBondSnapshotMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-07-17T00:00:30Z"));
    await Promise.all([
      queryClient.fetchQuery(primaryBondSnapshotQuery),
      queryClient.fetchQuery(primaryBondSnapshotQuery),
    ]);

    expect(getPrimaryBondSnapshotMock).toHaveBeenCalledTimes(2);
  });
});
