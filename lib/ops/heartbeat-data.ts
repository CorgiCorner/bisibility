import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { keywordLabel } from "@/lib/ops/labels";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "@/lib/rank-check/stale-checks";
import {
  collectRankScheduleHeartbeat,
  type RankScheduleHeartbeat,
} from "./heartbeat-schedule-data";
import { collectTrafficHeartbeat, type TrafficHeartbeatRow } from "./heartbeat-traffic-data";
import { failureEntries, fallbackEntries } from "./rank-failure-summary";

export type RankHeartbeat = {
  deferred: number;
  failed: number;
  lagP50Ms: number | null;
  lagP95Ms: number | null;
  recentFailures?: AdminRankFailure[];
  recentFallbacks?: AdminRankFailure[];
  scheduled: number;
  stuck: number;
  succeeded: number;
  topFailures: string[];
};

export type AdminRankFailure = {
  errorSummary: string;
  occurredAt: string;
  projectId: string;
  provider: string;
};

export type AdminRankHeartbeat = RankHeartbeat & {
  recentFailures: AdminRankFailure[];
  recentFallbacks: AdminRankFailure[];
};

export type { TrafficHeartbeatRow };

export type DatabaseHeartbeat = {
  bootstrapErrors: string[];
  rank: RankHeartbeat;
  schedule: RankScheduleHeartbeat;
  traffic: TrafficHeartbeatRow[];
  undeliveredEvents: number;
};

export type OperationalHeartbeat = Omit<DatabaseHeartbeat, "rank" | "schedule">;

type RankHeartbeatRow = {
  attempts: Prisma.JsonValue | null;
  checkedAt: Date;
  error: string | null;
  keyword: { id: string; projectId: string; text: string };
  provider: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  status: string;
};

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
}

async function findRankHeartbeatRows(now: Date, since: Date): Promise<RankHeartbeatRow[]> {
  const stuckBefore = new Date(now.getTime() - DEFAULT_STALE_RUNNING_CHECK_MINUTES * 60 * 1000);
  return prisma.rankCheck.findMany({
    orderBy: { checkedAt: "desc" },
    select: {
      attempts: true,
      checkedAt: true,
      error: true,
      provider: true,
      scheduledAt: true,
      startedAt: true,
      status: true,
      keyword: { select: { id: true, projectId: true, text: true } },
    },
    where: {
      OR: [
        { checkedAt: { gte: since } },
        { scheduledAt: { gte: since } },
        { startedAt: { gte: since } },
        { checkedAt: { lt: stuckBefore }, status: "running" },
      ],
    },
  });
}

function summarizeRankHeartbeatRows(
  rows: RankHeartbeatRow[],
  now: Date,
  since: Date,
  withDetails: boolean,
): AdminRankHeartbeat {
  const stuckBefore = new Date(now.getTime() - DEFAULT_STALE_RUNNING_CHECK_MINUTES * 60 * 1000);
  const recent = rows.filter((row) =>
    [row.checkedAt, row.scheduledAt, row.startedAt].some((value) => value && value >= since),
  );
  const lag = recent.flatMap((row) =>
    row.scheduledAt && row.startedAt
      ? [Math.max(0, row.startedAt.getTime() - row.scheduledAt.getTime())]
      : [],
  );
  const failures = rows.filter((row) => row.status === "failed" && row.checkedAt >= since);
  const fallbacks = rows.filter((row) => row.status === "completed" && row.checkedAt >= since);
  return {
    deferred: recent.filter((row) => row.status === "deferred").length,
    failed: recent.filter((row) => row.status === "failed").length,
    lagP50Ms: percentile(lag, 50),
    lagP95Ms: percentile(lag, 95),
    scheduled: recent.filter((row) => row.scheduledAt !== null).length,
    stuck: rows.filter(
      (row) => row.status === "running" && (row.startedAt ?? row.checkedAt) < stuckBefore,
    ).length,
    succeeded: recent.filter((row) => row.status === "completed").length,
    recentFailures: withDetails ? failureEntries(failures) : [],
    recentFallbacks: withDetails ? fallbackEntries(fallbacks) : [],
    topFailures: failures
      .slice(0, 5)
      .map((row) => `${keywordLabel(row.keyword.id, row.keyword.text)}: failed`),
  };
}

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
  return Object.fromEntries(
    entries.map(([key, since]) => [
      key,
      summarizeRankHeartbeatRows(rows, now, since, !detailKeys || detailKeys.includes(key)),
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

export async function collectOperationalHeartbeat(now: Date): Promise<OperationalHeartbeat> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [traffic, bootstrapEvents, undeliveredEvents] = await Promise.all([
    collectTrafficHeartbeat(now, since),
    prisma.opsEvent.findMany({
      orderBy: { createdAt: "desc" },
      select: { fields: true },
      take: 10,
      where: { createdAt: { gte: since }, kind: "schedule_bootstrap", severity: "error" },
    }),
    prisma.opsEvent.count({ where: { deliveredAt: null } }),
  ]);
  return {
    bootstrapErrors: bootstrapEvents.map((event) => {
      const fields =
        event.fields && typeof event.fields === "object" && !Array.isArray(event.fields)
          ? (event.fields as Record<string, unknown>)
          : {};
      const scheduleId = fields["Schedule ID"];
      return typeof scheduleId === "string" ? `${scheduleId}: failed` : "Schedule bootstrap failed";
    }),
    traffic,
    undeliveredEvents,
  };
}

export async function collectDatabaseHeartbeat(now: Date): Promise<DatabaseHeartbeat> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [rank, schedule, operational] = await Promise.all([
    collectRankHeartbeatWindow(now, since),
    collectRankScheduleHeartbeat(now, since),
    collectOperationalHeartbeat(now),
  ]);
  return { ...operational, rank, schedule };
}

export async function pruneOperationalObservability(now: Date) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [runs, events] = await prisma.$transaction([
    prisma.operationalRun.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    prisma.opsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { events: events.count, runs: runs.count };
}
