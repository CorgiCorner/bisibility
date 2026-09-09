import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";

const heartbeat = {
  inspectionErrors: 0,
  issueSchedules: [],
  missedCatchupTotal: 0,
  nextActionAt: null,
  recentActions: 3,
  scheduleIssues: [],
  schedules: 8,
  skippedOverlapTotal: 0,
};

const rankWindow = {
  deferred: 0,
  failed: 0,
  lagP50Ms: null,
  lagP95Ms: null,
  scheduled: 0,
  stuck: 0,
  succeeded: 0,
};

export const baseData = {
  availability: {
    dataSources: true,
    opsDelivery: true,
    opsEvents: true,
    presence: true,
    rankChecks: true,
    stats: true,
    worker: true,
  },
  generatedAt: "2026-07-17T12:00:00.000Z",
  ops: {
    configured: true,
    enabled: true,
    events: [],
    undeliveredCount: 0,
  },
  rank24h: {
    ...rankWindow,
    failureBreakdown: { groups: [], remainderCount: 0 },
    fallbackBreakdown: { groups: [], remainderCount: 0 },
  },
  rank7d: rankWindow,
  stats: {
    activeProviderConnectionsByKind: [
      { count: 3, kind: "analytics" },
      { count: 1, kind: "serp" },
    ],
    keywords: 3,
    projects: 3,
    providerUsage: [
      {
        billableUnits: 12,
        checks: 3,
        provider: "serpapi",
        providerLabel: "SerpApi",
        rateBasis: "Production plan equivalent",
        referenceCostCents: 12,
        referenceCostKnown: true,
      },
      {
        billableUnits: 1,
        checks: 1,
        provider: "dataforseo",
        providerLabel: "DataForSEO",
        rateBasis: "Live depth pricing",
        referenceCostCents: 0.2,
        referenceCostKnown: true,
      },
    ],
    users: 1,
  },
  providerHealth: [],
  presence: null,
  temporal: {
    bootstrapErrors: [],
    collectedAt: "2026-07-17T11:55:00.000Z",
    heartbeat,
    status: "ok",
  },
  worker: {
    alertDeliveryTaskQueue: "alert-deliveries",
    appliedMigration: "20260724220000_instance_settings",
    bundledMigration: "20260724220000_instance_settings",
    environment: "production",
    heartbeatAgeMs: 0,
    heartbeatState: "fresh",
    lastSeenAt: "2026-07-17T12:00:00.000Z",
    namespace: "default",
    release: "worker-image-sha",
    revision: "worker-public-revision",
    schedulerDriver: "temporal",
    schedulerMode: "legacy",
    schemaComparison: "ok",
    status: "ok",
    taskQueue: "rank-checks",
    temporalIdentityComparison: {
      detail:
        "app: default / rank-checks / alert-deliveries · worker: default / rank-checks / alert-deliveries",
      status: "match",
    },
  },
} satisfies InstanceAdminDashboard;

export const unavailableTemporal = {
  bootstrapErrors: [],
  collectedAt: null,
  heartbeat: null,
  status: "unavailable",
} satisfies InstanceAdminDashboard["temporal"];

export const disabledTemporal = {
  ...unavailableTemporal,
  status: "disabled",
} satisfies InstanceAdminDashboard["temporal"];

export const staleTemporal = {
  ...unavailableTemporal,
  collectedAt: "2026-07-17T11:20:00.000Z",
  heartbeat,
  status: "stale",
} satisfies InstanceAdminDashboard["temporal"];

export function withTemporal(
  temporal: InstanceAdminDashboard["temporal"],
  worker: InstanceAdminDashboard["worker"] = baseData.worker,
) {
  return { ...baseData, temporal, worker };
}
