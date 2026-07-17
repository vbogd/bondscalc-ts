import { getPrimaryBondSnapshot } from "./client";

export const PRIMARY_BOND_SNAPSHOT_QUERY_KEY = [
  "moex",
  "primary-bond-snapshot",
] as const;
export const PRIMARY_BOND_SNAPSHOT_STALE_TIME_MS = 30_000;

export const primaryBondSnapshotQuery = {
  queryKey: PRIMARY_BOND_SNAPSHOT_QUERY_KEY,
  queryFn: getPrimaryBondSnapshot,
  staleTime: PRIMARY_BOND_SNAPSHOT_STALE_TIME_MS,
};
