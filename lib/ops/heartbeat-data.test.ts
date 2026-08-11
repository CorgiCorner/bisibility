import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  opsCount: vi.fn(),
  opsDeleteMany: vi.fn(),
  opsFindMany: vi.fn(),
  operationalDeleteMany: vi.fn(),
  operationalFindMany: vi.fn(),
  keywordFindMany: vi.fn(),
  keywordCount: vi.fn(),
  projectFindMany: vi.fn(),
  providerFindMany: vi.fn(),
  rankFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    operationalRun: {
      deleteMany: mocks.operationalDeleteMany,
      findMany: mocks.operationalFindMany,
    },
    opsEvent: {
      count: mocks.opsCount,
      deleteMany: mocks.opsDeleteMany,
      findMany: mocks.opsFindMany,
    },
    providerConnection: { findMany: mocks.providerFindMany },
    keyword: { count: mocks.keywordCount, findMany: mocks.keywordFindMany },
    project: { findMany: mocks.projectFindMany },
    rankCheck: { findMany: mocks.rankFindMany },
  },
}));

import {
  collectDatabaseHeartbeat,
  collectRankHeartbeatWindows,
  pruneOperationalObservability,
} from "./heartbeat-data";
import { buildHeartbeatEvent } from "./heartbeat-format";
import { summarizeRankFailure } from "./rank-failure-summary";

describe("database heartbeat aggregation", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerFindMany.mockResolvedValue([
      {
        id: "connection_1",
        project: { domain: "docs.example", id: "project_1", name: "Docs" },
        provider: "gsc",
        status: "connected",
      },
    ]);
    mocks.projectFindMany.mockResolvedValue([]);
    mocks.opsFindMany.mockResolvedValue([
      {
        fields: { "Schedule ID": "rank-check-1", Status: "failed" },
        title: "Temporal schedule bootstrap failed",
      },
    ]);
    mocks.opsCount.mockResolvedValue(2);
    mocks.keywordFindMany.mockResolvedValue([]);
    mocks.keywordCount.mockResolvedValue(0);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("maps provider failures to the fixed admin diagnostic vocabulary", () => {
    expect([
      summarizeRankFailure("429 rate limit"),
      summarizeRankFailure("401 credentials rejected"),
      summarizeRankFailure("request timed out"),
      summarizeRankFailure("monthly budget exceeded"),
      summarizeRankFailure("unexpected response"),
    ]).toEqual([
      "Provider rate limited",
      "Provider authentication failed",
      "Provider request timed out",
      "Budget limit reached",
      "Provider check failed",
    ]);
  });

  it("summarizes rank timing, traffic freshness, and row metrics", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        checkedAt: new Date("2026-07-16T11:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_alpha", projectId: "project_1", text: "alpha" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T10:59:59.000Z"),
        startedAt: new Date("2026-07-16T11:00:00.000Z"),
        status: "completed",
      },
      {
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: "provider failed",
        keyword: { id: "keyword_beta", projectId: "project_1", text: "beta" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
      {
        checkedAt: new Date("2026-07-16T09:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_gamma", projectId: "project_1", text: "gamma" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:00:00.000Z"),
        startedAt: new Date("2026-07-16T09:00:00.000Z"),
        status: "deferred",
      },
      {
        checkedAt: new Date("2026-07-14T09:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_stuck", projectId: "project_1", text: "stuck" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-14T09:00:00.000Z"),
        startedAt: new Date("2026-07-14T09:00:00.000Z"),
        status: "running",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([
      {
        connectionId: "connection_1",
        errorClass: "provider_5xx",
        meta: { rowsFetched: 0, rowsMatched: 0, rowsUpserted: 0 },
        projectId: "project_1",
        provider: "gsc",
        startedAt: new Date("2026-07-16T11:00:00.000Z"),
        status: "failed",
      },
      {
        connectionId: "connection_1",
        meta: { rowsFetched: 10, rowsMatched: 8, rowsUpserted: 8 },
        projectId: "project_1",
        provider: "gsc",
        startedAt: new Date("2026-07-16T08:00:00.000Z"),
        status: "succeeded_with_data",
      },
    ]);

    const result = await collectDatabaseHeartbeat(now);

    expect(result.rank).toMatchObject({
      deferred: 1,
      failed: 1,
      lagP50Ms: 1_000,
      lagP95Ms: 3_000,
      scheduled: 3,
      stuck: 1,
      succeeded: 1,
      topFailures: ["keyword_beta: failed"],
    });
    expect(result.rank.recentFailures).toEqual([
      {
        errorSummary: "Provider check failed",
        occurredAt: "2026-07-16T10:00:00.000Z",
        projectId: "project_1",
        provider: "serpapi",
      },
    ]);
    expect(JSON.stringify(result.rank.recentFailures)).not.toContain("keyword_");
    expect(result.traffic).toEqual([
      {
        connectionId: "connection_1",
        errorClass: "provider_5xx",
        failureEscalated: true,
        latestSuccessAt: "2026-07-16T08:00:00.000Z",
        project: "project_1",
        projectId: "project_1",
        provider: "gsc",
        rowsFetched: 10,
        rowsMatched: 8,
        rowsUpserted: 8,
        status: "failed",
      },
    ]);
    expect(result).toMatchObject({
      bootstrapErrors: ["rank-check-1: failed"],
      schedule: { active: 0, dueWithoutRun: 0, tracked: 0 },
      undeliveredEvents: 2,
    });
  });

  it("keeps a needs_reauth connection out of the failed traffic count", async () => {
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.operationalFindMany.mockResolvedValue([]);
    mocks.providerFindMany.mockResolvedValue([
      {
        id: "connection_1",
        project: { domain: "docs.example", id: "project_1", name: "Docs" },
        provider: "plausible",
        status: "needs_reauth",
      },
    ]);

    await expect(collectDatabaseHeartbeat(now)).resolves.toMatchObject({
      traffic: [
        {
          connectionId: "connection_1",
          provider: "plausible",
          status: "needs_reauth",
        },
      ],
    });
  });

  it("does not escalate an active provider from disabled or recovered historical failures", async () => {
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.providerFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `connection_${index + 1}`,
        project: {
          domain: `project-${index + 1}.example.com`,
          id: `project_${index + 1}`,
          name: `Project ${index + 1}`,
        },
        provider: "plausible",
        status: "connected",
      })),
    );
    mocks.projectFindMany.mockResolvedValue([
      {
        domain: "retired.example.com",
        id: "project_retired",
        name: "Retired project",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([
      {
        connectionId: "connection_1",
        errorClass: null,
        finishedAt: now,
        meta: null,
        projectId: "project_1",
        provider: "plausible",
        startedAt: now,
        status: "succeeded_empty",
      },
      {
        connectionId: "connection_2",
        errorClass: "network",
        finishedAt: new Date("2026-07-16T11:50:00.000Z"),
        meta: null,
        projectId: "project_2",
        provider: "plausible",
        startedAt: new Date("2026-07-16T11:50:00.000Z"),
        status: "failed",
      },
      {
        connectionId: "connection_1",
        errorClass: "network",
        finishedAt: new Date("2026-07-16T11:40:00.000Z"),
        meta: null,
        projectId: "project_1",
        provider: "plausible",
        startedAt: new Date("2026-07-16T11:40:00.000Z"),
        status: "failed",
      },
      {
        connectionId: "connection_retired",
        errorClass: "network",
        finishedAt: new Date("2026-07-16T11:30:00.000Z"),
        meta: null,
        projectId: "project_retired",
        provider: "plausible",
        startedAt: new Date("2026-07-16T11:30:00.000Z"),
        status: "failed",
      },
    ]);

    const result = await collectDatabaseHeartbeat(now);
    const failedConnection = result.traffic.find((row) => row.connectionId === "connection_2");

    expect(failedConnection).toMatchObject({
      connectionId: "connection_2",
      projectId: "project_2",
      status: "failed",
    });
    expect(failedConnection).not.toHaveProperty("failureEscalated");
  });

  it("aggregates fallback attempts on completed checks without double-counting failures", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        attempts: [
          { message: "request timed out", provider: "dataforseo" },
          { message: "429 rate limit", provider: "serpapi" },
        ],
        checkedAt: new Date("2026-07-16T11:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_alpha", projectId: "project_1", text: "alpha" },
        provider: "serper",
        scheduledAt: new Date("2026-07-16T10:59:59.000Z"),
        startedAt: new Date("2026-07-16T11:00:00.000Z"),
        status: "completed",
      },
      {
        attempts: null,
        checkedAt: new Date("2026-07-16T10:30:00.000Z"),
        error: null,
        keyword: { id: "keyword_clean", projectId: "project_1", text: "clean" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T10:29:59.000Z"),
        startedAt: new Date("2026-07-16T10:30:00.000Z"),
        status: "completed",
      },
      {
        attempts: [{ message: "network down", provider: "serpapi" }],
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: "all providers failed",
        keyword: { id: "keyword_beta", projectId: "project_1", text: "beta" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([]);

    const result = await collectDatabaseHeartbeat(now);

    expect(result.rank.recentFallbacks).toEqual([
      {
        errorSummary: "Provider request timed out",
        occurredAt: "2026-07-16T11:00:00.000Z",
        projectId: "project_1",
        provider: "dataforseo",
      },
      {
        errorSummary: "Provider rate limited",
        occurredAt: "2026-07-16T11:00:00.000Z",
        projectId: "project_1",
        provider: "serpapi",
      },
    ]);
    expect(JSON.stringify(result.rank.recentFallbacks)).not.toContain("keyword_");
  });

  it("splits a failed check into per-provider reasons from its recorded attempts", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        attempts: [
          { message: "request timed out", provider: "dataforseo" },
          { message: "429 rate limit", provider: "serpapi" },
        ],
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error:
          "All SERP providers failed: dataforseo (request timed out); serpapi (429 rate limit)",
        keyword: { id: "keyword_beta", projectId: "project_1", text: "beta" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([]);

    const result = await collectDatabaseHeartbeat(now);

    expect(result.rank.recentFailures).toEqual([
      {
        errorSummary: "Provider request timed out",
        occurredAt: "2026-07-16T10:00:00.000Z",
        projectId: "project_1",
        provider: "dataforseo",
      },
      {
        errorSummary: "Provider rate limited",
        occurredAt: "2026-07-16T10:00:00.000Z",
        projectId: "project_1",
        provider: "serpapi",
      },
    ]);
    expect(result.rank.failed).toBe(1);
  });

  it("keeps the single aggregate failure entry when a failed check has no attempts", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        attempts: null,
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: "provider failed",
        keyword: { id: "keyword_beta", projectId: "project_1", text: "beta" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([]);

    const result = await collectDatabaseHeartbeat(now);

    expect(result.rank.recentFailures).toEqual([
      {
        errorSummary: "Provider check failed",
        occurredAt: "2026-07-16T10:00:00.000Z",
        projectId: "project_1",
        provider: "serpapi",
      },
    ]);
  });

  it("omits detail arrays for windows not selected for details", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        attempts: [{ message: "request timed out", provider: "dataforseo" }],
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_recent", projectId: "project_1", text: "recent" },
        provider: "serper",
        scheduledAt: new Date("2026-07-16T09:59:59.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "completed",
      },
      {
        attempts: [{ message: "network down", provider: "serpapi" }],
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: "all providers failed",
        keyword: { id: "keyword_fail", projectId: "project_1", text: "fail" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
    ]);

    const result = await collectRankHeartbeatWindows(
      now,
      {
        rank24h: new Date("2026-07-15T12:00:00.000Z"),
        rank7d: new Date("2026-07-09T12:00:00.000Z"),
      },
      ["rank24h"],
    );

    expect(result.rank24h.recentFallbacks).toHaveLength(1);
    expect(result.rank24h.recentFailures).toHaveLength(1);
    expect(result.rank7d.recentFallbacks).toEqual([]);
    expect(result.rank7d.recentFailures).toEqual([]);
    expect(result.rank7d.succeeded).toBe(1);
    expect(result.rank7d.failed).toBe(1);
  });

  it("distinguishes anchored future schedules from phased overdue schedules without a run", async () => {
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.operationalFindMany.mockResolvedValue([]);
    mocks.keywordFindMany.mockResolvedValue([
      {
        id: "keyword_monthly",
        project: { defaults: null, owner: { deactivatedAt: null }, writeMode: "normal" },
        rankChecks: [],
        schedule: {
          frequency: "monthly",
          nextCheckAt: new Date("2026-07-19T17:15:00.000Z"),
        },
      },
    ]);
    mocks.keywordCount.mockResolvedValue(1);

    await expect(
      collectDatabaseHeartbeat(new Date("2026-07-19T06:00:00.000Z")),
    ).resolves.toMatchObject({ schedule: { active: 1, dueWithoutRun: 0, tracked: 1 } });
    expect(mocks.keywordCount).toHaveBeenCalledWith({
      where: { project: { owner: { deactivatedAt: null }, writeMode: "active" } },
    });
    expect(mocks.keywordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: { owner: { deactivatedAt: null }, writeMode: "active" },
        }),
      }),
    );

    mocks.keywordFindMany.mockResolvedValue([
      {
        id: "keyword_daily",
        project: { defaults: null, owner: { deactivatedAt: null }, writeMode: "normal" },
        rankChecks: [],
        schedule: {
          frequency: "daily",
          nextCheckAt: new Date("2026-07-19T05:15:00.000Z"),
        },
      },
    ]);
    mocks.keywordCount.mockResolvedValue(1);

    await expect(
      collectDatabaseHeartbeat(new Date("2026-07-19T06:00:00.000Z")),
    ).resolves.toMatchObject({ schedule: { active: 1, dueWithoutRun: 1, tracked: 1 } });
  });

  it("does not mark a due schedule missed when its scheduled run was created", async () => {
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.operationalFindMany.mockResolvedValue([]);
    mocks.keywordFindMany.mockResolvedValue([
      {
        id: "keyword_daily",
        project: { defaults: null, owner: { deactivatedAt: null }, writeMode: "normal" },
        rankChecks: [{ scheduledAt: new Date("2026-07-19T05:16:00.000Z") }],
        schedule: {
          frequency: "daily",
          nextCheckAt: new Date("2026-07-19T05:15:00.000Z"),
        },
      },
    ]);
    mocks.keywordCount.mockResolvedValue(1);

    await expect(
      collectDatabaseHeartbeat(new Date("2026-07-19T06:00:00.000Z")),
    ).resolves.toMatchObject({ schedule: { active: 1, dueWithoutRun: 0, tracked: 1 } });
  });

  it("keeps digest tenant names out by default and restores them only after opt-in", async () => {
    mocks.providerFindMany.mockResolvedValue([
      {
        id: "connection_1",
        project: { id: "project_1", name: "Private project name" },
        provider: "gsc",
      },
    ]);
    mocks.rankFindMany.mockResolvedValue([
      {
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: "customer@example.eu failed for https://tenant.example/private-keyword",
        keyword: {
          id: "keyword_private",
          projectId: "project_1",
          text: "private keyword fixture",
        },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:57.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "failed",
      },
    ]);
    mocks.operationalFindMany.mockResolvedValue([]);

    const minimized = buildHeartbeatEvent({
      database: await collectDatabaseHeartbeat(now),
      now,
      temporalCounterState: { status: "missing" },
      schedulesEnabled: { "maintenance-traffic-sync": true },
      suppressed: {},
      sweep: { attempted: 0, delivered: 0 },
      temporal: {
        inspectionErrors: 0,
        issueSchedules: [],
        missedCatchupTotal: 0,
        nextActionAt: null,
        recentActions: 0,
        scheduleIssues: [],
        schedules: 0,
        skippedOverlapTotal: 0,
      },
      workerStartedAt: new Date("2026-07-16T06:00:00.000Z"),
    });
    const minimizedPayload = JSON.stringify(minimized);
    expect(minimizedPayload).toContain("keyword_private");
    expect(minimizedPayload).toContain("project_1");
    expect(minimizedPayload).not.toContain("private keyword fixture");
    expect(minimizedPayload).not.toContain("Private project name");
    expect(minimizedPayload).not.toContain("customer@example.eu");
    expect(minimizedPayload).not.toContain("tenant.example");

    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");
    const named = buildHeartbeatEvent({
      database: await collectDatabaseHeartbeat(now),
      now,
      temporalCounterState: { status: "missing" },
      schedulesEnabled: { "maintenance-traffic-sync": true },
      suppressed: {},
      sweep: { attempted: 0, delivered: 0 },
      temporal: {
        inspectionErrors: 0,
        issueSchedules: [],
        missedCatchupTotal: 0,
        nextActionAt: null,
        recentActions: 0,
        scheduleIssues: [],
        schedules: 0,
        skippedOverlapTotal: 0,
      },
      workerStartedAt: new Date("2026-07-16T06:00:00.000Z"),
    });
    const namedPayload = JSON.stringify(named);
    expect(namedPayload).toContain("keyword_private (private keyword fixture)");
    expect(namedPayload).toContain("Private project name [project_1]");
    expect(namedPayload).not.toContain("customer@example.eu");
    expect(namedPayload).not.toContain("tenant.example");
  });

  it("resolves a human project label for run-only traffic rows", async () => {
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");
    mocks.providerFindMany.mockResolvedValue([]);
    mocks.projectFindMany.mockResolvedValue([
      { domain: "example.com", id: "project_run_only", name: "Example" },
    ]);
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.operationalFindMany.mockResolvedValue([
      {
        connectionId: "connection_old",
        finishedAt: now,
        meta: null,
        projectId: "project_run_only",
        provider: "gsc",
        startedAt: now,
        status: "failed",
      },
    ]);

    const result = await collectDatabaseHeartbeat(now);

    expect(result.traffic[0]?.project).toBe("example.com [project_run_only]");
  });

  it("derives multiple rank windows from one indexed database read", async () => {
    mocks.rankFindMany.mockResolvedValue([
      {
        checkedAt: new Date("2026-07-16T10:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_recent", projectId: "project_1", text: "recent" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-16T09:59:59.000Z"),
        startedAt: new Date("2026-07-16T10:00:00.000Z"),
        status: "completed",
      },
      {
        checkedAt: new Date("2026-07-12T10:00:00.000Z"),
        error: null,
        keyword: { id: "keyword_week", projectId: "project_1", text: "week" },
        provider: "serpapi",
        scheduledAt: new Date("2026-07-12T09:59:59.000Z"),
        startedAt: new Date("2026-07-12T10:00:00.000Z"),
        status: "completed",
      },
    ]);

    const result = await collectRankHeartbeatWindows(now, {
      rank24h: new Date("2026-07-15T12:00:00.000Z"),
      rank7d: new Date("2026-07-09T12:00:00.000Z"),
    });

    expect(mocks.rankFindMany).toHaveBeenCalledOnce();
    expect(result.rank24h.succeeded).toBe(1);
    expect(result.rank7d.succeeded).toBe(2);
  });

  it("prunes both durable observability tables after 30 days", async () => {
    mocks.operationalDeleteMany.mockResolvedValue({ count: 3 });
    mocks.opsDeleteMany.mockResolvedValue({ count: 4 });
    mocks.transaction.mockImplementation(async (queries) => Promise.all(queries));

    await expect(pruneOperationalObservability(now)).resolves.toEqual({ events: 4, runs: 3 });
    expect(mocks.operationalDeleteMany).toHaveBeenCalledWith({
      where: { startedAt: { lt: new Date("2026-06-16T12:00:00.000Z") } },
    });
  });
});
