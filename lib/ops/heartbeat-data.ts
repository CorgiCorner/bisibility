import "server-only";

import { collectOperationalHeartbeat } from "./heartbeat-operational";

export { collectOperationalHeartbeat } from "./heartbeat-operational";

import { prisma } from "@/lib/db/prisma";
import { collectRankDispatchHeartbeat } from "./heartbeat-dispatch-data";
import { heartbeatEvidenceCounts } from "./heartbeat-evidence";
import { readHeartbeatEvidence } from "./heartbeat-evidence-read";
import { findRankHeartbeatRows, summarizeRankHeartbeatRows } from "./heartbeat-rank-operational";
import { collectRankScheduleHeartbeat } from "./heartbeat-schedule-data";

export type {
  AdminRankFailure,
  AdminRankHeartbeat,
  DatabaseHeartbeat,
  OperationalHeartbeat,
  RankHeartbeat,
  TrafficHeartbeatRow,
} from "./heartbeat-types";

import type { AdminRankHeartbeat, DatabaseHeartbeat } from "./heartbeat-types";

// `detailWindows` lists the window keys that keep their recentFailures/recentFallbacks arrays;
// omit it to build details for every window. Undetailed windows skip the flatMap/parse work.
export async function collectRankHeartbeatWindows<const Windows extends Record<string, Date>>(
  now: Date,
  windows: Windows,
  detailWindows?: readonly (keyof Windows)[],
): Promise<{ [Key in keyof Windows]: AdminRankHeartbeat }> {
  const entries = Object.entries(windows);
  if (entries.length === 0) return {} as { [Key in keyof Windows]: AdminRankHeartbeat };

  const detailKeys = detailWindows ? (detailWindows as readonly string[]) : null;
  const earliest = new Date(Math.min(...entries.map(([, since]) => since.getTime())));
  const rows = await findRankHeartbeatRows(now, earliest);
  const evidence = await readHeartbeatEvidence(rows);
  return Object.fromEntries(
    entries.map(([key, since]) => [
      key,
      {
        ...summarizeRankHeartbeatRows(rows, now, since, !detailKeys || detailKeys.includes(key)),
        evidenceCounts: heartbeatEvidenceCounts(
          rows
            .filter((row) =>
              [row.checkedAt, row.scheduledAt, row.startedAt].some(
                (value) => value && value >= since,
              ),
            )
            .map((row) => evidence.get(row.publicId ?? "") ?? null),
        ),
      },
    ]),
  ) as { [Key in keyof Windows]: AdminRankHeartbeat };
}

export async function collectRankHeartbeatWindow(
  now: Date,
  since: Date,
): Promise<AdminRankHeartbeat> {
  const result = await collectRankHeartbeatWindows(now, { window: since });
  return result.window;
}

export async function collectDatabaseHeartbeat(now: Date): Promise<DatabaseHeartbeat> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [rank, schedule, dispatch, operational] = await Promise.all([
    collectRankHeartbeatWindow(now, since),
    collectRankScheduleHeartbeat(now),
    collectRankDispatchHeartbeat(now),
    collectOperationalHeartbeat(now),
  ]);
  return { ...operational, rank, schedule, dispatch, collectionAvailable: true };
}

export async function pruneOperationalObservability(now: Date) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [runs, events] = await prisma.$transaction([
    prisma.operationalRun.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    prisma.opsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { events: events.count, runs: runs.count };
}
