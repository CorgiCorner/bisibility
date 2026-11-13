import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  fetchPlausibleGoalConversions,
  PlausibleGoalParseError,
} from "@/lib/providers/analytics/plausible-goals";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderConfigurationError } from "@/lib/providers/failure-class";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { scheduledMaintenanceEnabled } from "@/lib/rank-check/scheduled-maintenance";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";
import { addUtcDays, utcDay, utcDayKey } from "./dates";
import {
  aggregatePlausibleGoals,
  type PlausibleDailyAggregate,
  plausibleDailyWrite,
  plausibleGoalCreate,
} from "./plausible-rows";

export const PLAUSIBLE_SYNC_FIRST_DAYS = 35;
export const PLAUSIBLE_SYNC_OVERLAP_DAYS = 2;
export const PLAUSIBLE_SYNC_MAX_DAYS = 90;

const WRITE_CHUNK = 400;

export type PlausibleSyncError =
  | "auth"
  | "configuration"
  | "invalid_response"
  | "not_connected"
  | "provider"
  | "rate_limited";

export type PlausibleConversionsSyncResult = {
  created: number;
  deleted: number;
  error: PlausibleSyncError | null;
  goals: number;
  ok: boolean;
  skipped: "maintenance" | null;
  truncated: boolean;
  updated: number;
};

type ExistingRow = PlausibleDailyAggregate & { id: string };

const EMPTY: PlausibleConversionsSyncResult = {
  created: 0,
  deleted: 0,
  error: null,
  goals: 0,
  ok: true,
  skipped: null,
  truncated: false,
  updated: 0,
};

function fail(projectId: string, error: PlausibleSyncError): PlausibleConversionsSyncResult {
  console.error("[conversions] plausible goal sync failed", { error, projectId });
  return { ...EMPTY, error, ok: false };
}

export function plausibleSyncWindow(now: Date, lastDay: Date | null) {
  const end = utcDay(now);
  if (!lastDay) {
    return {
      from: utcDayKey(addUtcDays(end, -(PLAUSIBLE_SYNC_FIRST_DAYS - 1))),
      to: utcDayKey(end),
      truncated: false,
    };
  }
  const desired = addUtcDays(utcDay(lastDay), -PLAUSIBLE_SYNC_OVERLAP_DAYS);
  const from = desired.getTime() > end.getTime() ? end : desired;
  const capped = addUtcDays(from, PLAUSIBLE_SYNC_MAX_DAYS - 1);
  if (capped.getTime() < end.getTime()) {
    return { from: utcDayKey(from), to: utcDayKey(capped), truncated: true };
  }
  return { from: utcDayKey(from), to: utcDayKey(end), truncated: false };
}

function rowKey(row: { date: Date; name: string; pathHash: string }) {
  return `${utcDay(row.date).getTime()}:${row.pathHash}:${row.name}`;
}

function sameRow(current: ExistingRow, next: PlausibleDailyAggregate) {
  return (
    current.count === next.count &&
    current.path === next.path &&
    current.currency === next.currency &&
    current.revenueMinor === next.revenueMinor
  );
}

function mapFailure(projectId: string, error: unknown): PlausibleConversionsSyncResult {
  if (error instanceof ProviderAuthError) return fail(projectId, "auth");
  if (error instanceof ProviderConfigurationError) return fail(projectId, "configuration");
  if (error instanceof ProviderRateLimitedError) return fail(projectId, "rate_limited");
  if (error instanceof PlausibleGoalParseError) return fail(projectId, "invalid_response");
  return fail(projectId, "provider");
}

async function loadConnection(projectId: string) {
  const [project, connection] = await Promise.all([
    prisma.project.findUnique({ select: { domain: true }, where: { id: projectId } }),
    prisma.providerConnection.findUnique({
      select: {
        credentialsEncrypted: true,
        enabled: true,
        id: true,
        kind: true,
        provider: true,
        status: true,
      },
      where: { projectId_provider: { projectId, provider: "plausible" } },
    }),
  ]);
  const connected =
    connection?.kind === "analytics" && connection.status === "connected" && connection.enabled;
  if (!connected || !project?.domain) return null;
  return { connection, domain: project.domain };
}

async function writeGoals(
  projectId: string,
  aggregated: readonly PlausibleDailyAggregate[],
  now: Date,
  tx: Pick<typeof prisma, "conversionGoal">,
) {
  const names = [...new Set(aggregated.map((row) => row.name))];
  if (names.length === 0) return 0;
  const existing = await tx.conversionGoal.findMany({
    where: { projectId, source: "plausible", sourceName: { in: names } },
  });
  const byName = new Map(existing.map((goal) => [goal.sourceName, goal]));
  let writes = 0;
  for (const name of names) {
    const dates = aggregated.filter((row) => row.name === name).map((row) => row.date.getTime());
    const firstSeen = new Date(Math.min(...dates));
    const lastSeen = new Date(Math.max(...dates));
    const goal = byName.get(name);
    if (!goal) {
      await tx.conversionGoal.create({
        data: plausibleGoalCreate({
          createdAt: now,
          firstSeen,
          lastSeen,
          projectId,
          sourceName: name,
          updatedAt: now,
        }),
      });
      writes += 1;
      continue;
    }
    const nextFirst = goal.firstSeen.getTime() <= firstSeen.getTime() ? goal.firstSeen : firstSeen;
    const nextLast = goal.lastSeen.getTime() >= lastSeen.getTime() ? goal.lastSeen : lastSeen;
    if (
      utcDay(nextFirst).getTime() === utcDay(goal.firstSeen).getTime() &&
      utcDay(nextLast).getTime() === utcDay(goal.lastSeen).getTime()
    ) {
      continue;
    }
    await tx.conversionGoal.update({
      data: { firstSeen: utcDay(nextFirst), lastSeen: utcDay(nextLast) },
      where: { id: goal.id },
    });
    writes += 1;
  }
  return writes;
}

/**
 * Idempotent upsert of Plausible goal conversions. A failure returns a typed result and
 * does not write. Never throws, so a scheduler can keep running.
 */
export async function syncPlausibleConversions(
  projectId: string,
  options: { now?: Date; scheduled?: boolean } = {},
): Promise<PlausibleConversionsSyncResult> {
  try {
    if (options.scheduled && !scheduledMaintenanceEnabled()) {
      return { ...EMPTY, skipped: "maintenance" };
    }
    const loaded = await loadConnection(projectId);
    if (!loaded) return fail(projectId, "not_connected");
    const now = options.now ?? new Date();
    const last = await prisma.conversionDaily.aggregate({
      _max: { date: true },
      where: { projectId, source: "plausible" },
    });
    const window = plausibleSyncWindow(now, last._max.date);
    const fetched = await fetchPlausibleGoalConversions(
      trafficRuntimeCredentials(loaded.connection),
      {
        endDate: window.to,
        startDate: window.from,
      },
    );
    const aggregated = aggregatePlausibleGoals(loaded.domain, fetched.rows);
    const existing = await prisma.conversionDaily.findMany({
      select: {
        count: true,
        currency: true,
        date: true,
        id: true,
        name: true,
        path: true,
        pathHash: true,
        revenueMinor: true,
      },
      where: {
        date: {
          gte: utcDay(new Date(`${window.from}T00:00:00.000Z`)),
          lte: utcDay(new Date(`${window.to}T00:00:00.000Z`)),
        },
        projectId,
        source: "plausible",
      },
    });
    const wanted = new Map(aggregated.map((row) => [rowKey(row), row]));
    const present = new Map(existing.map((row) => [rowKey(row), row]));
    const creates = aggregated.filter((row) => !present.has(rowKey(row)));
    const updates = aggregated.filter((row) => {
      const current = present.get(rowKey(row));
      return current != null && !sameRow(current, row);
    });
    const staleIds = fetched.truncated
      ? []
      : existing.filter((row) => !wanted.has(rowKey(row))).map((row) => row.id);
    const goalsWouldChange = aggregated.length > 0;
    if (
      creates.length === 0 &&
      updates.length === 0 &&
      staleIds.length === 0 &&
      !goalsWouldChange
    ) {
      return { ...EMPTY, truncated: window.truncated || fetched.truncated };
    }
    let goals = 0;
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < creates.length; index += WRITE_CHUNK) {
        await tx.conversionDaily.createMany({
          data: creates
            .slice(index, index + WRITE_CHUNK)
            .map((row) =>
              plausibleDailyWrite({ ...row, createdAt: now, projectId, updatedAt: now }),
            ),
        });
      }
      for (const row of updates) {
        const current = present.get(rowKey(row));
        if (!current) continue;
        await tx.conversionDaily.update({
          data: {
            count: row.count,
            currency: row.currency,
            path: row.path,
            revenueMinor: row.revenueMinor,
          },
          where: { id: current.id },
        });
      }
      if (staleIds.length > 0) {
        await tx.conversionDaily.deleteMany({ where: { id: { in: staleIds } } });
      }
      goals = await writeGoals(projectId, aggregated, now, tx);
    });
    return {
      created: creates.length,
      deleted: staleIds.length,
      error: null,
      goals,
      ok: true,
      skipped: null,
      truncated: window.truncated || fetched.truncated,
      updated: updates.length,
    };
  } catch (error) {
    return mapFailure(projectId, error);
  }
}
