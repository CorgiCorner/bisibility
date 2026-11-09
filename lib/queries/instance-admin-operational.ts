import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getOpsConfig } from "@/lib/ops/config";
import { collectOperationalHeartbeat } from "@/lib/ops/heartbeat-operational";
import { collectOperationalRankHeartbeatWindows } from "@/lib/ops/heartbeat-rank-operational";
import type { AdminRankHeartbeat, OperationalHeartbeat } from "@/lib/ops/heartbeat-types";
import { buildFailureBreakdown, buildProviderHealthMatrix } from "@/lib/ops/instance-admin-health";
import { getWorkerLivenessDetails, type WorkerLiveness } from "@/lib/ops/liveness";
import { getTemporalSnapshot } from "@/lib/ops/temporal-snapshot";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { schedulerDriver } from "@/lib/scheduler/driver";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";
import { loadDashboardSection } from "./instance-admin-section";

const DAY_MS = 24 * 60 * 60 * 1000;

function numericOpsField(fields: unknown, key: string) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return 0;
  const value = (fields as Record<string, unknown>)[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const unavailableWorker: WorkerLiveness = {
  alertDeliveryTaskQueue: null,
  appliedMigration: null,
  bundledMigration: null,
  environment: "unknown",
  heartbeatAgeMs: null,
  heartbeatState: "absent",
  lastSeenAt: null,
  namespace: null,
  release: "unknown",
  revision: "unknown",
  schedulerDriver: "unknown",
  schedulerMode: "unknown",
  schemaComparison: "unknown",
  status: "unknown",
  taskQueue: null,
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

export async function getInstanceAdminOperationalData(
  now = new Date(),
  collectRanks = collectOperationalRankHeartbeatWindows,
) {
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const opsConfig = getOpsConfig();
  const driver = schedulerDriver();
  const [workerResult, databaseResult, ranksResult, temporalResult, eventsResult, presenceResult] =
    await Promise.all([
      driver === "none"
        ? Promise.resolve({
            available: true,
            data: { ...unavailableWorker, schedulerDriver: "none" as const },
          })
        : loadDashboardSection(
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
        () => collectRanks(now, { rank24h: oneDayAgo, rank7d: sevenDaysAgo }, ["rank24h"]),
        { rank24h: unavailableRankHeartbeat, rank7d: unavailableRankHeartbeat },
      ),
      driver === "none"
        ? Promise.resolve({ available: true, data: null })
        : loadDashboardSection("Temporal snapshot", () => getTemporalSnapshot(now), null),
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
    ]);
  const workerLiveness = workerResult.data;
  const worker = {
    ...workerLiveness,
    temporalIdentityComparison: compareWorkerTemporalIdentity(
      temporalDeploymentConfig(),
      workerLiveness,
    ),
  };
  const database = databaseResult.data;
  const ranks = ranksResult.data;
  const temporalSnapshot = temporalResult.data;
  const events = eventsResult.data;
  const presenceEvent = presenceResult.data;

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
    temporal: {
      bootstrapErrors: database.bootstrapErrors,
      collectedAt: temporalSnapshot?.collectedAt ?? null,
      heartbeat: temporalSnapshot?.heartbeat ?? null,
      status:
        driver === "none"
          ? ("disabled" as const)
          : (temporalSnapshot?.status ?? ("unavailable" as const)),
    },
    worker,
  };
}

export type InstanceAdminOperations = Awaited<ReturnType<typeof getInstanceAdminOperationalData>>;
