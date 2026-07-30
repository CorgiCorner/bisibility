import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getOpsConfig } from "@/lib/ops/config";
import {
  type AdminRankHeartbeat,
  collectOperationalHeartbeat,
  collectRankHeartbeatWindows,
  type OperationalHeartbeat,
} from "@/lib/ops/heartbeat-data";
import { buildFailureBreakdown, buildProviderHealthMatrix } from "@/lib/ops/instance-admin-health";
import { getWorkerLivenessDetails, type WorkerLiveness } from "@/lib/ops/liveness";
import { getTemporalSnapshot } from "@/lib/ops/temporal-snapshot";
import { monthStartUtc } from "@/lib/rank-check/budget";
import { aggregateProviderReferenceUsage } from "@/lib/rank-check/reference-usage";

const DAY_MS = 24 * 60 * 60 * 1000;

function numericOpsField(fields: unknown, key: string) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return 0;
  const value = (fields as Record<string, unknown>)[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getInstanceStats(now: Date) {
  const monthStart = monthStartUtc(now);
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [users, projects, keywords, providerConnectionGroups, monthlyUsageGroups] =
    await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.keyword.count(),
      prisma.providerConnection.groupBy({
        _count: { _all: true },
        by: ["kind"],
        where: { enabled: true, status: "connected" },
      }),
      prisma.rankCheck.groupBy({
        _count: { _all: true },
        by: ["provider", "requestedDepth", "billingUnits"],
        where: {
          checkedAt: { gte: monthStart, lt: nextMonthStart },
          status: "completed",
        },
      }),
    ]);

  return {
    activeProviderConnectionsByKind: providerConnectionGroups.map((group) => ({
      count: group._count._all,
      kind: group.kind,
    })),
    keywords,
    projects,
    providerUsage: aggregateProviderReferenceUsage(
      monthlyUsageGroups.map((group) => ({
        billingUnits: group.billingUnits,
        checks: group._count._all,
        provider: group.provider,
        requestedDepth: group.requestedDepth,
      })),
    ),
    users,
  };
}

const unavailableWorker: WorkerLiveness = {
  appliedMigration: null,
  bundledMigration: null,
  environment: "unknown",
  heartbeatAgeMs: null,
  heartbeatState: "absent",
  lastSeenAt: null,
  release: "unknown",
  schedulerMode: "unknown",
  schemaComparison: "unknown",
  status: "unknown",
};

const unavailableOperationalHeartbeat: OperationalHeartbeat = {
  bootstrapErrors: [],
  traffic: [],
  undeliveredEvents: 0,
};

const unavailableRankHeartbeat: AdminRankHeartbeat = {
  deferred: 0,
  failed: 0,
  lagP50Ms: null,
  lagP95Ms: null,
  recentFailures: [],
  recentFallbacks: [],
  scheduled: 0,
  stuck: 0,
  succeeded: 0,
  topFailures: [],
};

const unavailableStats: Awaited<ReturnType<typeof getInstanceStats>> = {
  activeProviderConnectionsByKind: [],
  keywords: 0,
  projects: 0,
  providerUsage: [],
  users: 0,
};

async function loadDashboardSection<T>(
  section: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<{ available: boolean; data: T }> {
  try {
    return { available: true, data: await load() };
  } catch (error) {
    console.error("[instance-admin] section unavailable", { error, section });
    return { available: false, data: fallback };
  }
}

export async function getInstanceAdminDashboard(now = new Date()) {
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const opsConfig = getOpsConfig();
  const [
    workerResult,
    databaseResult,
    ranksResult,
    temporalResult,
    eventsResult,
    presenceResult,
    statsResult,
  ] = await Promise.all([
    loadDashboardSection(
      "worker heartbeat",
      () => getWorkerLivenessDetails(now),
      unavailableWorker,
    ),
    loadDashboardSection(
      "operational heartbeat",
      () => collectOperationalHeartbeat(now),
      unavailableOperationalHeartbeat,
    ),
    loadDashboardSection(
      "rank heartbeat",
      () =>
        collectRankHeartbeatWindows(now, { rank24h: oneDayAgo, rank7d: sevenDaysAgo }, ["rank24h"]),
      { rank24h: unavailableRankHeartbeat, rank7d: unavailableRankHeartbeat },
    ),
    loadDashboardSection("Temporal snapshot", () => getTemporalSnapshot(now), null),
    loadDashboardSection(
      "ops events",
      () =>
        prisma.opsEvent.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            attempts: true,
            createdAt: true,
            deliveredAt: true,
            kind: true,
            severity: true,
          },
          take: 20,
        }),
      [],
    ),
    loadDashboardSection(
      "presence event",
      () =>
        prisma.opsEvent.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, fields: true },
          where: { kind: "presence_inspection_budget" },
        }),
      null,
    ),
    loadDashboardSection("instance stats", () => getInstanceStats(now), unavailableStats),
  ]);
  const worker = workerResult.data;
  const database = databaseResult.data;
  const ranks = ranksResult.data;
  const temporalSnapshot = temporalResult.data;
  const events = eventsResult.data;
  const presenceEvent = presenceResult.data;
  const stats = statsResult.data;

  const {
    recentFailures: recentFailures24h,
    recentFallbacks: recentFallbacks24h,
    topFailures: _topFailures24h,
    ...rank24hBase
  } = ranks.rank24h;
  const {
    recentFailures: _recentFailures7d,
    recentFallbacks: _recentFallbacks7d,
    topFailures: _topFailures7d,
    ...rank7dForAdmin
  } = ranks.rank7d;
  const rank24h = {
    ...rank24hBase,
    failureBreakdown: buildFailureBreakdown(recentFailures24h ?? []),
    fallbackBreakdown: buildFailureBreakdown(recentFallbacks24h ?? []),
  };
  const providerHealth = buildProviderHealthMatrix(database.traffic, now);

  return {
    availability: {
      dataSources: databaseResult.available,
      opsDelivery: databaseResult.available,
      opsEvents: eventsResult.available,
      presence: presenceResult.available,
      rankChecks: ranksResult.available,
      stats: statsResult.available,
      worker: workerResult.available,
    },
    generatedAt: now.toISOString(),
    ops: {
      configured: Boolean(opsConfig.webhookUrl),
      enabled: opsConfig.enabled,
      events: events.map((event) => ({
        attempts: event.attempts,
        createdAt: event.createdAt.toISOString(),
        deliveredAt: event.deliveredAt?.toISOString() ?? null,
        kind: event.kind,
        severity: event.severity,
      })),
      undeliveredCount: database.undeliveredEvents,
    },
    providerHealth,
    presence: presenceEvent
      ? {
          affectedProjects: numericOpsField(presenceEvent.fields, "Affected project count"),
          deferred: numericOpsField(presenceEvent.fields, "Deferred URLs"),
          occurredAt: presenceEvent.createdAt.toISOString(),
        }
      : null,
    rank24h,
    rank7d: rank7dForAdmin,
    stats,
    temporal: {
      bootstrapErrors: database.bootstrapErrors,
      collectedAt: temporalSnapshot?.collectedAt ?? null,
      heartbeat: temporalSnapshot?.heartbeat ?? null,
      status: temporalSnapshot?.status ?? ("unavailable" as const),
    },
    worker,
  };
}

export type InstanceAdminDashboard = Awaited<ReturnType<typeof getInstanceAdminDashboard>>;
