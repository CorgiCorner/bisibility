import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectReadOnlyError } from "../deployment/project-write-mode";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import { BudgetExhaustedError } from "../rank-check/budget";
import { RankCheckClosedBeforePersistenceError } from "../rank-check/persistence-errors";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  authorizeRankCheckExecutionActivity,
  BUDGET_EXHAUSTED_FAILURE,
  createRunningRankCheckActivity,
  discardRankCheckActivity,
  failRankCheckActivity,
  PROJECT_READ_ONLY_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  runRankCheckActivity,
} from "./rank-check-activities";

const mocks = vi.hoisted(() => ({
  loadProviderRateContext: vi.fn(),
  notifyDeferredRankCheckOps: vi.fn(),
  notifyFailedRankCheckOps: vi.fn(),
  persistFailedRankCheck: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    rankCheck: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  },
  runKeywordCheckWithFallback: vi.fn(),
}));

vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../provider-rates/connection-context", () => ({
  loadProviderRateContext: mocks.loadProviderRateContext,
}));
vi.mock("../rank-check/fallback", () => ({
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));
vi.mock("../rank-check/runner", () => ({
  persistFailedRankCheck: mocks.persistFailedRankCheck,
}));
vi.mock("./rank-check-ops", () => ({
  notifyDeferredRankCheckOps: mocks.notifyDeferredRankCheckOps,
  notifyFailedRankCheckOps: mocks.notifyFailedRankCheckOps,
}));

function runningInput(
  overrides: Partial<Parameters<typeof createRunningRankCheckActivity>[0]> = {},
) {
  return {
    keywordId: "keyword_1",
    scheduleId: null,
    scheduledAt: null,
    trigger: "manual" as const,
    workflowRunId: "run_manual_1",
    ...overrides,
  };
}

describe("rank-check activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.loadProviderRateContext.mockResolvedValue({ entries: [], manualAmountCents: null });
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0,
      id: "connection_1",
      projectId: "project_1",
    });
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      project: { defaults: null },
      publicId: "kw_a00000000000000000000000",
      schedule: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ["legacy", "legacy", true],
    ["legacy", "dispatcher", false],
    ["cutover", "legacy", false],
    ["cutover", "dispatcher", false],
    ["dispatcher", "legacy", false],
    ["dispatcher", "dispatcher", true],
  ] as const)("authorizes %s mode for %s automatic work: %s", (mode, source, allowed) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    expect(
      authorizeRankCheckExecutionActivity({
        keywordId: "keyword_1",
        scheduleId: `source-${source}`,
        source,
      }),
    ).toMatchObject({ allowed, mode, source });
  });

  it.each(["legacy", "cutover", "dispatcher"] as const)(
    "keeps manual checks available in %s",
    (mode) => {
      vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
      expect(
        authorizeRankCheckExecutionActivity({
          keywordId: "keyword_1",
          scheduleId: null,
          source: "manual",
        }),
      ).toEqual({ allowed: true, mode, reason: null, source: "manual" });
    },
  );

  it("creates a running rank-check row when no row id is supplied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:00:00.000Z"));
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0.75,
      provider: "serpapi",
    });

    await expect(
      createRunningRankCheckActivity(runningInput({ providerId: "serpapi" })),
    ).resolves.toEqual({ keywordId: "keyword_1", rankCheckId: "rank_running_1" });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        estimatedCostCents: 0.75,
        keywordId: "keyword_1",
        provider: "serpapi",
        scheduleId: null,
        scheduledAt: null,
        startedAt: new Date("2026-01-01T06:00:00.000Z"),
        status: "running",
        trigger: "manual",
        workflowRunId: "run_manual_1",
      }),
      select: { id: true, publicId: true },
    });
  });

  it("reserves the runtime chain head by priority", async () => {
    const connections = [
      {
        costPerCheckCents: 0.25,
        priority: 0,
        projectId: "project_1",
        provider: "serpapi",
      },
      {
        costPerCheckCents: 0.75,
        priority: 100,
        projectId: "project_1",
        provider: "dataforseo",
      },
    ];
    mocks.prisma.providerConnection.findFirst.mockImplementation(({ orderBy }) => {
      const ordered = [...connections].sort((left, right) => {
        for (const clause of orderBy) {
          const [field, direction] = Object.entries(clause)[0] as [
            keyof (typeof connections)[number],
            "asc" | "desc",
          ];
          const leftValue = left[field];
          const rightValue = right[field];
          if (leftValue === rightValue) continue;
          const comparison = leftValue < rightValue ? -1 : 1;
          return direction === "asc" ? comparison : -comparison;
        }
        return 0;
      });
      return Promise.resolve(ordered[0]);
    });
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });

    await createRunningRankCheckActivity(runningInput());

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimatedCostCents: 0.25 }),
      select: { id: true, publicId: true },
    });
  });

  it.each([
    [{ project: { defaults: { serpDepth: 100 } }, schedule: { serpDepth: 10 } }, undefined, 1],
    [{ project: { defaults: { serpDepth: 100 } }, schedule: null }, undefined, 10],
    [{ project: { defaults: { serpDepth: 100 } }, schedule: { serpDepth: 10 } }, 20, 2],
  ] as const)("reserves the depth-aware SerpAPI estimate", async (keyword, depth, expected) => {
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: null,
      projectId: "project_1",
      provider: "serpapi",
    });
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      ...keyword,
      publicId: "kw_a00000000000000000000000",
    });

    await createRunningRankCheckActivity(runningInput({ depth, providerId: "serpapi" }));

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimatedCostCents: expected }),
      select: { id: true, publicId: true },
    });
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { costPerCheckCents: true, id: true, projectId: true, provider: true },
      }),
    );
    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith({
      select: {
        publicId: true,
        project: { select: { defaults: { select: { serpDepth: true } } } },
        schedule: { select: { serpDepth: true } },
      },
      where: { id: "keyword_1" },
    });
  });

  it("reserves the measured rank-check rate used by execution", async () => {
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: null,
      id: "connection_serpapi",
      projectId: "project_1",
      provider: "serpapi",
    });
    mocks.loadProviderRateContext.mockResolvedValue({
      entries: [0.5, 0.75, 0.75, 0.9, 1].map((costCents) => ({
        cached: false,
        costCents,
        createdAt: new Date("2026-07-27T00:00:00.000Z"),
        failed: false,
      })),
      manualAmountCents: null,
    });

    await createRunningRankCheckActivity(runningInput({ providerId: "serpapi" }));

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimatedCostCents: 0.75 }),
      select: { id: true, publicId: true },
    });
  });

  it("persists scheduled workflow identity and timing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:00:05.000Z"));
    const scheduledAt = new Date("2026-01-01T06:00:00.000Z");
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });

    await createRunningRankCheckActivity(
      runningInput({
        scheduleId: "rank-check-keyword_1",
        scheduledAt,
        trigger: "scheduled",
        workflowRunId: "run_scheduled_1",
      }),
    );

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduleId: "rank-check-keyword_1",
        scheduledAt,
        startedAt: new Date("2026-01-01T06:00:05.000Z"),
        trigger: "scheduled",
        workflowRunId: "run_scheduled_1",
      }),
      select: { id: true, publicId: true },
    });
  });

  it("claims an existing pre-created running row", async () => {
    mocks.prisma.rankCheck.update.mockResolvedValue({
      id: "rank_existing_1",
      publicId: "check_a00000000000000000000000",
    });

    await createRunningRankCheckActivity(
      runningInput({
        providerId: "serpapi",
        rankCheckId: "rank_existing_1",
      }),
    );

    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "running" }),
      select: { id: true, publicId: true },
      where: { id: "rank_existing_1" },
    });
  });

  it("audits the running transition in the same transaction", async () => {
    const tx = {
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      rankCheck: {
        create: vi.fn(({ data }) =>
          Promise.resolve({
            id: "rank_running_1",
            publicId: "check_a00000000000000000000000",
            ...data,
          }),
        ),
        update: vi.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0.75,
      provider: "serpapi",
    });
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });

    await createRunningRankCheckActivity(runningInput({ providerId: "serpapi" }));

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(tx.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estimatedCostCents: 0.75,
        provider: "serpapi",
        status: "running",
      }),
      select: { id: true, publicId: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rank_check.running",
          actorId: null,
          targetId: expect.stringMatching(/^check_[a-z][a-z0-9]{23}$/),
          targetType: "rank_check",
        }),
      }),
    );
  });

  it("marks a deferred row finished and audits the transition in the same transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:01:00.000Z"));
    const estimatedCostCents = { toString: () => "0.75" };
    const tx = {
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      rankCheck: {
        update: vi.fn(() =>
          Promise.resolve({
            estimatedCostCents,
            id: "rank_running_1",
            keyword: {
              id: "keyword_1",
              projectId: "project_1",
              publicId: "kw_a00000000000000000000000",
              text: "rank tracker",
            },
            provider: "serpapi",
            publicId: "check_a00000000000000000000000",
            scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
            startedAt: new Date("2026-01-01T06:00:05.000Z"),
          }),
        ),
      },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      discardRankCheckActivity({ rankCheckId: "rank_running_1", reason: "rate limited" }),
    ).resolves.toEqual({ rankCheckId: "rank_running_1" });

    expect(tx.rankCheck.update).toHaveBeenCalledWith({
      data: {
        attemptCount: 0,
        deferredReason: "rate limited",
        degradedToCountry: false,
        finishedAt: new Date("2026-01-01T06:01:00.000Z"),
        normalizationVersion: null,
        status: "deferred",
        viaFallback: false,
      },
      select: {
        estimatedCostCents: true,
        id: true,
        publicId: true,
        keyword: { select: { id: true, projectId: true, publicId: true, text: true } },
        provider: true,
        scheduledAt: true,
        startedAt: true,
      },
      where: { id: "rank_running_1" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rank_check.deferred",
          actorId: null,
          after: {
            estimatedCostCents: 0.75,
            keywordId: "kw_a00000000000000000000000",
            provider: "serpapi",
            reason: "rate limited",
            status: "deferred",
          },
          projectId: "project_1",
          targetId: "check_a00000000000000000000000",
          targetType: "rank_check",
        }),
      }),
    );
    expect(mocks.notifyDeferredRankCheckOps).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      keywordText: "rank tracker",
      projectId: "project_1",
      provider: "serpapi",
      reason: "rate limited",
      scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });
  });

  it("marks the running row failed through shared failure persistence", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      id: "keyword_1",
      project: { defaults: { serpDepth: 50 }, domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      rankChecks: [{ position: 8 }],
      schedule: { serpDepth: 20 },
      text: "rank tracker",
    });
    mocks.persistFailedRankCheck.mockResolvedValue({
      attempts: [{ message: "failed", provider: "serpapi" }],
      id: "rank_running_1",
      provider: "primary",
      scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });

    await failRankCheckActivity({
      keywordId: "keyword_1",
      message: "provider failed",
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({ where: { status: "completed" } }),
        }),
      }),
    );
    expect(mocks.persistFailedRankCheck).toHaveBeenCalledWith({
      error: "provider failed",
      existingRankCheckId: "rank_running_1",
      keywordId: "keyword_1",
      keywordPublicId: "kw_a00000000000000000000000",
      keywordText: "rank tracker",
      previousPosition: 8,
      projectDomain: "example.com",
      projectId: "project_1",
      provider: "primary",
      requestedDepth: 20,
    });
    expect(mocks.notifyFailedRankCheckOps).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      keywordText: "rank tracker",
      projectId: "project_1",
      provider: "primary",
      providerAttemptCount: 1,
      scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });
  });

  it("treats a stale-sweep closed row as an already-terminal failure", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      id: "keyword_1",
      project: { defaults: null, domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.persistFailedRankCheck.mockRejectedValue(new RankCheckClosedBeforePersistenceError());

    await expect(
      failRankCheckActivity({
        keywordId: "keyword_1",
        message: "provider failed",
        rankCheckId: "rank_stale_1",
      }),
    ).resolves.toEqual({ rankCheckId: "rank_stale_1" });

    expect(mocks.notifyFailedRankCheckOps).not.toHaveBeenCalled();
  });

  it("threads the running row id into the rank-check runner", async () => {
    mocks.runKeywordCheckWithFallback.mockResolvedValue({
      attempts: [],
      provider: "serpapi",
      rankCheck: {
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0.1,
        id: "rank_running_1",
        keywordId: "keyword_1",
        position: 3,
        rankingUrl: "https://example.com/rank",
      },
    });

    await expect(
      runRankCheckActivity({
        depth: 20,
        keywordId: "keyword_1",
        rankCheckId: "rank_running_1",
        source: "manual",
      }),
    ).resolves.toMatchObject({ rankCheckId: "rank_running_1", position: 3 });

    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith({
      depth: 20,
      keywordId: "keyword_1",
      providerId: undefined,
      rankCheckId: "rank_running_1",
    });
  });

  it("rechecks automatic mode before provider execution on a late activity retry", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "dispatcher",
    });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it("maps provider rate limits to a non-retryable Temporal failure", async () => {
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new ProviderRateLimitedError("serpapi", { message: "rate limited" }),
    );

    const promise = runRankCheckActivity({ keywordId: "keyword_1", source: "manual" });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: PROVIDER_RATE_LIMITED_FAILURE,
    });
  });

  it("maps exhausted budgets to a non-retryable Temporal failure", async () => {
    mocks.runKeywordCheckWithFallback.mockRejectedValue(
      new BudgetExhaustedError({ capCents: 1, projectId: "project_1", spentCents: 1 }),
    );

    const promise = runRankCheckActivity({ keywordId: "keyword_1", source: "manual" });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: BUDGET_EXHAUSTED_FAILURE,
    });
  });

  it("maps project read-only errors to a non-retryable Temporal failure", async () => {
    mocks.runKeywordCheckWithFallback.mockRejectedValue(new ProjectReadOnlyError("project_1"));

    const promise = runRankCheckActivity({ keywordId: "keyword_1", source: "manual" });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: PROJECT_READ_ONLY_FAILURE,
    });
  });
});
