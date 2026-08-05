import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectOperational: vi.fn(),
  collectRanks: vi.fn(),
  config: vi.fn(),
  getTemporalSnapshot: vi.fn(),
  keywordCount: vi.fn(),
  liveness: vi.fn(),
  opsFindFirst: vi.fn(),
  opsFindMany: vi.fn(),
  projectCount: vi.fn(),
  providerGroupBy: vi.fn(),
  rankGroupBy: vi.fn(),
  userCount: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { count: mocks.keywordCount },
    opsEvent: { findFirst: mocks.opsFindFirst, findMany: mocks.opsFindMany },
    project: { count: mocks.projectCount },
    providerConnection: { groupBy: mocks.providerGroupBy },
    rankCheck: { groupBy: mocks.rankGroupBy },
    user: { count: mocks.userCount },
  },
}));
vi.mock("@/lib/ops/config", () => ({ getOpsConfig: mocks.config }));
vi.mock("@/lib/ops/heartbeat-data", () => ({
  collectOperationalHeartbeat: mocks.collectOperational,
  collectRankHeartbeatWindows: mocks.collectRanks,
}));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/temporal-snapshot", () => ({
  getTemporalSnapshot: mocks.getTemporalSnapshot,
}));

import { getInstanceAdminDashboard, getInstanceStats } from "./instance-admin";

const rank = {
  deferred: 1,
  failed: 1,
  lagP50Ms: 10,
  lagP95Ms: 20,
  recentFailures: [
    {
      errorSummary: "Provider check failed",
      keywordId: "keyword_1",
      occurredAt: "2026-07-17T11:00:00.000Z",
      projectId: "project_1",
      provider: "serpapi",
    },
  ],
  recentFallbacks: [
    {
      errorSummary: "Provider request timed out",
      keywordId: "keyword_1",
      occurredAt: "2026-07-17T09:00:00.000Z",
      projectId: "project_1",
      provider: "dataforseo",
    },
  ],
  scheduled: 3,
  stuck: 0,
  succeeded: 1,
  topFailures: ["keyword_1 (private keyword fixture): failed"],
};

describe("instance admin queries", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.userCount.mockResolvedValue(3);
    mocks.projectCount.mockResolvedValue(2);
    mocks.keywordCount.mockResolvedValue(10);
    mocks.providerGroupBy.mockResolvedValue([
      { _count: { _all: 3 }, kind: "analytics" },
      { _count: { _all: 1 }, kind: "serp" },
    ]);
    mocks.rankGroupBy.mockResolvedValue([
      {
        _count: { _all: 2 },
        billingUnits: null,
        provider: "dataforseo",
        requestedDepth: 10,
      },
      {
        _count: { _all: 3 },
        billingUnits: 4,
        provider: "serpapi",
        requestedDepth: 100,
      },
    ]);
    mocks.config.mockReturnValue({ enabled: true, webhookUrl: "configured" });
    mocks.liveness.mockResolvedValue({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "worker-production",
      lastSeenAt: "2026-07-17T11:00:00.000Z",
      release: "worker-image-sha",
      schemaComparison: "ok",
      status: "ok",
    });
    mocks.collectOperational.mockResolvedValue({
      bootstrapErrors: [],
      traffic: [
        {
          connectionId: "connection_1",
          latestSuccessAt: "2026-07-17T10:00:00.000Z",
          project: "project_1 (Private project fixture)",
          projectId: "project_1",
          provider: "gsc",
          rowsFetched: 10,
          rowsMatched: 8,
          rowsUpserted: 8,
          status: "succeeded_with_data",
        },
      ],
      undeliveredEvents: 0,
    });
    mocks.collectRanks.mockResolvedValue({ rank24h: rank, rank7d: rank });
    mocks.getTemporalSnapshot.mockResolvedValue({
      collectedAt: "2026-07-17T11:55:00.000Z",
      heartbeat: {
        inspectionErrors: 0,
        issueSchedules: [],
        missedCatchupTotal: 0,
        nextActionAt: null,
        recentActions: 3,
        scheduleIssues: [],
        schedules: 8,
        skippedOverlapTotal: 0,
      },
      status: "ok",
    });
    mocks.opsFindMany.mockResolvedValue([
      {
        attempts: 1,
        createdAt: new Date("2026-07-17T10:00:00.000Z"),
        deliveredAt: new Date("2026-07-17T10:00:01.000Z"),
        id: "event_1",
        kind: "rank_check",
        severity: "error",
        title: "Private keyword fixture",
        fields: { Project: "Private project fixture" },
      },
    ]);
    mocks.opsFindFirst.mockResolvedValue({
      createdAt: new Date("2026-07-17T10:30:00.000Z"),
      fields: {
        "Affected project count": "2",
        "Affected projects": "project_1, project_2",
        "Deferred URLs": "7",
        Property: "sc-domain:private.example",
      },
    });
  });

  it("groups completed monthly usage by actual provider without tenant cost fields", async () => {
    await expect(getInstanceStats(now)).resolves.toEqual({
      activeProviderConnectionsByKind: [
        { count: 3, kind: "analytics" },
        { count: 1, kind: "serp" },
      ],
      keywords: 10,
      projects: 2,
      providerUsage: [
        {
          billableUnits: 12,
          checks: 3,
          provider: "serpapi",
          providerLabel: "SerpAPI",
          rateBasis: "Production plan equivalent",
          referenceCostCents: 12,
          referenceCostKnown: true,
        },
        {
          billableUnits: 2,
          checks: 2,
          provider: "dataforseo",
          providerLabel: "DataForSEO",
          rateBasis: "Live depth pricing",
          referenceCostCents: 0.4,
          referenceCostKnown: true,
        },
      ],
      users: 3,
    });

    expect(mocks.rankGroupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["provider", "requestedDepth", "billingUnits"],
      where: {
        checkedAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        status: "completed",
      },
    });
    expect(mocks.providerGroupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["kind"],
      where: { enabled: true, status: "connected" },
    });
  });

  it("returns identifiers but never optional tenant names or free-form event payloads", async () => {
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");

    const result = await getInstanceAdminDashboard(now);
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("project_1");
    expect(serialized).not.toContain("keyword_1");
    expect(serialized).not.toContain("keywordId");
    expect(serialized).not.toContain("connection_1");
    expect(serialized).not.toContain("private keyword fixture");
    expect(serialized).not.toContain("Private project fixture");
    expect(serialized).not.toContain("private.example");
    expect(result.ops.events[0]).toEqual({
      attempts: 1,
      createdAt: "2026-07-17T10:00:00.000Z",
      deliveredAt: "2026-07-17T10:00:01.000Z",
      kind: "rank_check",
      severity: "error",
    });
    expect(result.worker).toEqual({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "worker-production",
      lastSeenAt: "2026-07-17T11:00:00.000Z",
      release: "worker-image-sha",
      schemaComparison: "ok",
      status: "ok",
    });
    expect(result.rank24h.failureBreakdown.groups).toEqual([
      {
        count: 1,
        errorSummary: "Provider check failed",
        firstSeen: "2026-07-17T11:00:00.000Z",
        lastSeen: "2026-07-17T11:00:00.000Z",
        projectCount: 1,
        projectIds: ["project_1"],
        provider: "serpapi",
      },
    ]);
    expect(result.providerHealth).toEqual([
      {
        failed: 0,
        failureRatePercent: 0,
        notRun: 0,
        ok: 1,
        p95AgeMs: 7_200_000,
        provider: "gsc",
        stale: 0,
      },
    ]);
    expect(result.presence).toEqual({
      affectedProjects: 2,
      deferred: 7,
      occurredAt: "2026-07-17T10:30:00.000Z",
    });

    type FailureGroup = (typeof result.rank24h.failureBreakdown.groups)[number];
    expectTypeOf<FailureGroup>().not.toHaveProperty("keywordId");
  });

  it("wires the 24h fallback breakdown and keeps it off the 7d window", async () => {
    const result = await getInstanceAdminDashboard(now);

    expect(result.rank24h.fallbackBreakdown.groups).toEqual([
      {
        count: 1,
        errorSummary: "Provider request timed out",
        firstSeen: "2026-07-17T09:00:00.000Z",
        lastSeen: "2026-07-17T09:00:00.000Z",
        projectCount: 1,
        projectIds: ["project_1"],
        provider: "dataforseo",
      },
    ]);
    expect(result.rank7d).not.toHaveProperty("fallbackBreakdown");
    expect(result.rank7d).not.toHaveProperty("recentFallbacks");
    expect(JSON.stringify(result.rank24h.fallbackBreakdown)).not.toContain("keyword");
  });

  it("keeps liveness and instance stats available when Slack ops are disabled", async () => {
    mocks.config.mockReturnValueOnce({ enabled: false, webhookUrl: null });

    const result = await getInstanceAdminDashboard(now);

    expect(result.ops).toMatchObject({ configured: false, enabled: false });
    expect(result.worker).toMatchObject({ status: "ok" });
    expect(result.stats).toEqual({
      activeProviderConnectionsByKind: [
        { count: 3, kind: "analytics" },
        { count: 1, kind: "serp" },
      ],
      keywords: 10,
      projects: 2,
      providerUsage: expect.arrayContaining([
        expect.objectContaining({ provider: "dataforseo" }),
        expect.objectContaining({ provider: "serpapi" }),
      ]),
      users: 3,
    });
  });

  it("loads both rank windows through one shared query", async () => {
    await getInstanceAdminDashboard(now);

    expect(mocks.collectRanks).toHaveBeenCalledOnce();
    expect(mocks.collectRanks).toHaveBeenCalledWith(
      now,
      {
        rank24h: new Date("2026-07-16T12:00:00.000Z"),
        rank7d: dateFromFrozenNow({ hours: -11 }),
      },
      ["rank24h"],
    );
  });

  it("reports an unavailable Temporal snapshot without dialing Temporal", async () => {
    mocks.getTemporalSnapshot.mockResolvedValueOnce(null);

    const result = await getInstanceAdminDashboard(now);

    expect(result.temporal).toEqual({
      bootstrapErrors: [],
      collectedAt: null,
      heartbeat: null,
      status: "unavailable",
    });
    expect(mocks.getTemporalSnapshot).toHaveBeenCalledWith(now);
  });

  it("reports the scheduler as disabled without reading worker or Temporal liveness", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "none");

    const result = await getInstanceAdminDashboard(now);

    expect(result.worker).toMatchObject({ schedulerDriver: "none", status: "unknown" });
    expect(result.temporal).toMatchObject({
      collectedAt: null,
      heartbeat: null,
      status: "disabled",
    });
    expect(mocks.liveness).not.toHaveBeenCalled();
    expect(mocks.getTemporalSnapshot).not.toHaveBeenCalled();
  });

  it("resolves empty tables with missing operational configuration", async () => {
    mocks.config.mockReturnValueOnce({ enabled: false, webhookUrl: null });
    mocks.userCount.mockResolvedValueOnce(0);
    mocks.projectCount.mockResolvedValueOnce(0);
    mocks.keywordCount.mockResolvedValueOnce(0);
    mocks.providerGroupBy.mockResolvedValueOnce([]);
    mocks.rankGroupBy.mockResolvedValueOnce([]);
    mocks.liveness.mockResolvedValueOnce({
      appliedMigration: null,
      bundledMigration: null,
      environment: "unknown",
      lastSeenAt: null,
      release: "unknown",
      schemaComparison: "unknown",
      status: "unknown",
    });
    mocks.collectOperational.mockResolvedValueOnce({
      bootstrapErrors: [],
      traffic: [],
      undeliveredEvents: 0,
    });
    mocks.collectRanks.mockResolvedValueOnce({
      rank24h: {
        ...rank,
        deferred: 0,
        failed: 0,
        recentFailures: [],
        recentFallbacks: [],
        scheduled: 0,
        succeeded: 0,
      },
      rank7d: {
        ...rank,
        deferred: 0,
        failed: 0,
        recentFailures: [],
        recentFallbacks: [],
        scheduled: 0,
        succeeded: 0,
      },
    });
    mocks.getTemporalSnapshot.mockResolvedValueOnce(null);
    mocks.opsFindMany.mockResolvedValueOnce([]);
    mocks.opsFindFirst.mockResolvedValueOnce(null);

    const result = await getInstanceAdminDashboard(now);

    expect(result.availability).toEqual({
      dataSources: true,
      opsDelivery: true,
      opsEvents: true,
      presence: true,
      rankChecks: true,
      stats: true,
      worker: true,
    });
    expect(result).toMatchObject({
      generatedAt: now.toISOString(),
      ops: { configured: false, enabled: false, events: [], undeliveredCount: 0 },
      presence: null,
      providerHealth: [],
      stats: {
        activeProviderConnectionsByKind: [],
        keywords: 0,
        projects: 0,
        providerUsage: [],
        users: 0,
      },
      temporal: { collectedAt: null, heartbeat: null, status: "unavailable" },
      worker: { status: "unknown" },
    });
  });

  it("degrades an unavailable operational heartbeat and logs the real error", async () => {
    const error = new Error("operational store unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.collectOperational.mockRejectedValueOnce(error);

    const result = await getInstanceAdminDashboard(now);

    expect(result.availability).toMatchObject({
      dataSources: false,
      opsDelivery: false,
      opsEvents: true,
      rankChecks: true,
      stats: true,
      worker: true,
    });
    expect(result.providerHealth).toEqual([]);
    expect(result.ops.undeliveredCount).toBe(0);
    expect(consoleError).toHaveBeenCalledWith("[instance-admin] section unavailable", {
      error,
      section: "operational heartbeat",
    });
    consoleError.mockRestore();
  });

  it("contains independent section failures instead of rejecting the dashboard", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.liveness.mockRejectedValueOnce(new Error("worker unavailable"));
    mocks.collectOperational.mockRejectedValueOnce(new Error("operations unavailable"));
    mocks.collectRanks.mockRejectedValueOnce(new Error("ranks unavailable"));
    mocks.getTemporalSnapshot.mockRejectedValueOnce(new Error("Temporal unavailable"));
    mocks.opsFindMany.mockRejectedValueOnce(new Error("events unavailable"));
    mocks.opsFindFirst.mockRejectedValueOnce(new Error("presence unavailable"));
    mocks.userCount.mockRejectedValueOnce(new Error("stats unavailable"));

    const result = await getInstanceAdminDashboard(now);

    expect(result.availability).toEqual({
      dataSources: false,
      opsDelivery: false,
      opsEvents: false,
      presence: false,
      rankChecks: false,
      stats: false,
      worker: false,
    });
    expect(result.temporal).toMatchObject({ heartbeat: null, status: "unavailable" });
    expect(consoleError).toHaveBeenCalledTimes(7);
    consoleError.mockRestore();
  });
});
