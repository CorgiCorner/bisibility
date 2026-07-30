import type { TrafficSnapshotSyncMetrics } from "./snapshots";

export function emptyTrafficMetrics(): TrafficSnapshotSyncMetrics {
  return { rowsFetched: 0, rowsMatched: 0, rowsUpserted: 0, truncated: false };
}

export function addTrafficMetrics(
  target: TrafficSnapshotSyncMetrics,
  update: TrafficSnapshotSyncMetrics,
): void {
  target.rowsFetched += update.rowsFetched;
  target.rowsMatched += update.rowsMatched;
  target.rowsUpserted += update.rowsUpserted;
  target.truncated = target.truncated || update.truncated;
}

export function warnIfTrafficTruncated(input: {
  connectionId: string;
  metrics: TrafficSnapshotSyncMetrics;
  projectId: string;
  provider: string;
}): void {
  if (!input.metrics.truncated) return;
  console.warn("[traffic] query snapshot coverage truncated", {
    connectionId: input.connectionId,
    projectId: input.projectId,
    provider: input.provider,
    rowsFetched: input.metrics.rowsFetched,
  });
}
