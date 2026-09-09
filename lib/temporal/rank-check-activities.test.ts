import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectReadOnlyError } from "../deployment/project-write-mode";
import {
  PROJECT_DOMAIN_REQUIRED_MESSAGE,
  ProjectDomainRequiredError,
} from "../projects/tracked-domain";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import { BudgetExhaustedError } from "../rank-check/budget";
import { ProviderChainError } from "../rank-check/fallback";
import { RankCheckClosedBeforePersistenceError } from "../rank-check/persistence-errors";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  authorizeRankCheckExecutionActivity,
  BUDGET_EXHAUSTED_FAILURE,
  createRunningRankCheckActivity,
  discardRankCheckActivity,
  failRankCheckActivity,
  PROJECT_DOMAIN_REQUIRED_FAILURE,
  PROJECT_READ_ONLY_FAILURE,
  PROVIDER_AUTH_FAILURE,
  PROVIDER_BILLING_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  RANK_CHECK_CLOSED_FAILURE,
  runRankCheckActivity,
} from "./rank-check-activities";

const mocks = vi.hoisted(() => ({
  loadProviderRateContext: vi.fn(),
  notifyDeferredRankCheckOps: vi.fn(),
  notifyFailedRankCheckOps: vi.fn(),
  paidProvider: { fetchRank: vi.fn() },
  persistProviderResult: vi.fn(),
  persistFailedRankCheck: vi.fn(),
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  resolveExpectedUrlForKeyword: vi.fn(),
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { findMany: vi.fn(), findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    rankCheck: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rankCheckRun: { create: vi.fn(), updateMany: vi.fn() },
    rankCheckRunItem: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  runKeywordCheckWithFallback: vi.fn(),
}));

vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../expected-url/keyword", () => ({
  resolveExpectedUrlForKeyword: mocks.resolveExpectedUrlForKeyword,
}));
vi.mock("../notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("../provider-rates/connection-context", () => ({
  loadProviderRateContext: mocks.loadProviderRateContext,
}));
vi.mock("../rank-check/fallback", async () => {
  const actual =
    await vi.importActual<typeof import("../rank-check/fallback")>("../rank-check/fallback");
  return { ...actual, runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback };
});
vi.mock("../rank-check/runner", async () => {
  const actual =
    await vi.importActual<typeof import("../rank-check/runner")>("../rank-check/runner");
  return { ...actual, persistFailedRankCheck: mocks.persistFailedRankCheck };
});
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
    mocks.prisma.$executeRaw.mockResolvedValue(1);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.loadProviderRateContext.mockResolvedValue({ entries: [], manualAmountCents: null });
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0,
      id: "connection_1",
      projectId: "project_1",
    });
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      archivedAt: null,
      locationId: "location_1",
      project: { defaults: null },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      schedule: null,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.resolveExpectedUrlForKeyword.mockResolvedValue({ source: null, url: null });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_1" }]);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
    mocks.prisma.rankCheck.findUnique.mockResolvedValue(null);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.rankCheckRun.create.mockResolvedValue({ id: "run_wrapped_1" });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue(null);
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
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
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
    [
      {
        project: { defaults: { serpDepth: 20 } },
        checkSchedule: { serpDepth: null },
        schedule: { serpDepth: 10 },
      },
      undefined,
      2,
    ],
    [
      {
        project: { defaults: { serpDepth: 20 } },
        checkSchedule: { serpDepth: 50 },
        schedule: { serpDepth: 10 },
      },
      undefined,
      5,
    ],
    [
      {
        project: { defaults: { serpDepth: 20 } },
        checkSchedule: { serpDepth: 50 },
        schedule: { serpDepth: 10 },
      },
      100,
      10,
    ],
  ] as const)("reserves the depth-aware SerpApi estimate", async (keyword, depth, expected) => {
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
        projectId: true,
        publicId: true,
        project: {
          select: {
            defaults: { select: { serpDepth: true } },
            providerAllocationsInitializedAt: true,
          },
        },
        checkSchedule: { select: { serpDepth: true } },
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

  it("wraps a legacy fire once and reuses its linked rank check on replay", async () => {
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_legacy_1",
      publicId: "check_a00000000000000000000000",
    });
    mocks.prisma.rankCheck.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "rank_legacy_1", runId: "run_wrapped_1" });
    const input = runningInput({
      scheduleId: "rank-check-keyword_1",
      trigger: "scheduled",
      workflowRunId: "temporal_run_1",
    });

    await expect(createRunningRankCheckActivity(input)).resolves.toMatchObject({
      rankCheckId: "rank_legacy_1",
    });
    await expect(createRunningRankCheckActivity(input)).resolves.toMatchObject({
      rankCheckId: "rank_legacy_1",
    });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRun.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        items: {
          create: expect.objectContaining({
            keywordId: "keyword_1",
            rankCheckId: "rank_legacy_1",
            status: "running",
          }),
        },
        selectionKind: "legacy_schedule",
        selectionSpec: {
          kind: "legacy_schedule",
          keywordId: "kw_a00000000000000000000000",
          v: 1,
        },
        status: "running",
      }),
      select: { id: true },
    });
    expect(mocks.prisma.rankCheck.update).toHaveBeenCalledWith({
      data: { runId: "run_wrapped_1" },
      where: { id: "rank_legacy_1" },
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

  it("returns the linked rank check without creating again on activity replay", async () => {
    const item = {
      keywordId: "keyword_1",
      rankCheck: { workflowRunId: "run_manual_1" },
      rankCheckId: null as string | null,
      run: { projectId: "project_1" },
      runId: "run_1",
      status: "queued",
    };
    mocks.prisma.rankCheck.create.mockResolvedValue({
      id: "rank_running_1",
      publicId: "check_a00000000000000000000000",
    });
    mocks.prisma.rankCheckRunItem.findUnique.mockImplementation(async () => item);
    mocks.prisma.rankCheckRunItem.updateMany.mockImplementation(async ({ data, where }) => {
      if (item.status !== where.status) return { count: 0 };
      item.rankCheckId = data.rankCheckId;
      item.status = data.status;
      return { count: 1 };
    });
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
    const input = runningInput({ runItemId: "item_1" });

    await expect(createRunningRankCheckActivity(input)).resolves.toEqual({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
    });
    await expect(createRunningRankCheckActivity(input)).resolves.toEqual({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ runId: "run_1" }),
      select: { id: true, publicId: true },
    });
    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledOnce();
  });

  it("rejects a run item owned by another keyword before writing a rank check", async () => {
    const item = {
      keywordId: "keyword_2",
      rankCheckId: null,
      runId: "run_1",
      status: "queued",
    };
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue(item);

    await expect(
      createRunningRankCheckActivity(runningInput({ runItemId: "item_1" })),
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: "rank_check_run_item_keyword_mismatch",
    });

    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.update).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
    expect(item).toEqual({
      keywordId: "keyword_2",
      rankCheckId: null,
      runId: "run_1",
      status: "queued",
    });
  });

  it("audits the running transition in the same transaction", async () => {
    const tx = {
      $queryRaw: vi.fn(),
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
      $queryRaw: vi.fn(),
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      rankCheck: {
        findUniqueOrThrow: vi.fn(() =>
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
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      rankCheckRun: { update: vi.fn() },
      rankCheckRunItem: { findUnique: vi.fn(async () => null), updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      discardRankCheckActivity({ rankCheckId: "rank_running_1", reason: "rate limited" }),
    ).resolves.toEqual({ rankCheckId: "rank_running_1" });

    expect(tx.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        attemptCount: 0,
        deferredReason: "rate limited",
        degradedToCountry: false,
        finishedAt: new Date("2026-01-01T06:01:00.000Z"),
        normalizationVersion: null,
        status: "deferred",
        viaFallback: false,
      },
      where: { id: "rank_running_1", status: "running" },
    });
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(tx.rankCheck.findUniqueOrThrow).toHaveBeenCalledWith({
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

  it("does not let a discard replay overwrite a completed check", async () => {
    const item = { status: "completed" };
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.rankCheckRunItem.updateMany.mockImplementation(async ({ data }) => {
      item.status = data.status;
      return { count: 1 };
    });

    await expect(
      discardRankCheckActivity({ rankCheckId: "rank_completed_1", reason: "late retry" }),
    ).resolves.toEqual({ rankCheckId: "rank_completed_1" });

    expect(mocks.prisma.rankCheck.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
    expect(mocks.notifyDeferredRankCheckOps).not.toHaveBeenCalled();
    expect(item.status).toBe("completed");
  });

  it("marks the running row failed through shared failure persistence", async () => {
    const fullChainMessage = "All SERP providers failed: primary (Payment Required)";
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      id: "keyword_1",
      project: { defaults: { serpDepth: 50 }, domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      rankChecks: [{ position: 8 }],
      schedule: { serpDepth: 20 },
      text: "rank tracker",
    });
    mocks.prisma.rankCheck.findUnique.mockResolvedValue({
      attempts: [{ message: "Payment Required", provider: "primary" }],
      errorCode: "provider_billing",
    });
    mocks.persistFailedRankCheck.mockResolvedValue({
      attempts: [{ message: "Payment Required", provider: "primary" }],
      id: "rank_running_1",
      provider: "primary",
      scheduledAt: new Date("2026-01-01T06:00:00.000Z"),
      startedAt: new Date("2026-01-01T06:00:05.000Z"),
    });

    await failRankCheckActivity({
      keywordId: "keyword_1",
      message: fullChainMessage,
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({ where: { status: "completed" } }),
        }),
      }),
    );
    expect(mocks.prisma.rankCheck.findUnique).toHaveBeenCalledWith({
      select: { attempts: true, errorCode: true },
      where: { id: "rank_running_1" },
    });
    expect(mocks.persistFailedRankCheck).toHaveBeenCalledWith({
      error: fullChainMessage,
      errorCode: "provider_billing",
      attempts: [{ message: "Payment Required", provider: "primary" }],
      existingRankCheckId: "rank_running_1",
      expectedUrlAtCheck: null,
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
    expect(mocks.notifyFailedRankCheckOps).toHaveBeenCalledTimes(1);
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
      source: "app",
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

  it("maps a missing project domain to a non-retryable Temporal failure", async () => {
    mocks.runKeywordCheckWithFallback.mockRejectedValue(new ProjectDomainRequiredError());

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toMatchObject({
      message: PROJECT_DOMAIN_REQUIRED_MESSAGE,
      nonRetryable: true,
      type: PROJECT_DOMAIN_REQUIRED_FAILURE,
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

  it("makes provider billing failures non-retryable and stores chain metadata", async () => {
    const chainError = new ProviderChainError([
      { provider: "primary", message: "Payment Required", code: "provider_billing" },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toMatchObject({
      message: chainError.message,
      nonRetryable: true,
      type: PROVIDER_BILLING_FAILURE,
    });
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        attempts: [{ message: "Payment Required", provider: "primary" }],
        errorCode: "provider_billing",
      },
      where: { id: "rank_running_1", status: "running" },
    });
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledTimes(1);
  });

  it("makes provider auth failures non-retryable", async () => {
    const chainError = new ProviderChainError([
      { provider: "primary", message: "Unauthorized", code: "provider_auth" },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: PROVIDER_AUTH_FAILURE,
    });
  });

  it("makes all exhausted connection allocations non-retryable", async () => {
    const chainError = new ProviderChainError([
      {
        provider: "primary",
        message: "Provider connection monthly allocation reached.",
        reason: "allocation_exhausted",
      },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      runRankCheckActivity({
        keywordId: "keyword_1",
        rankCheckId: "rank_running_1",
        source: "manual",
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: BUDGET_EXHAUSTED_FAILURE,
    });
  });

  it("re-throws transient chain errors so Temporal retries them", async () => {
    const chainError = new ProviderChainError([
      { provider: "primary", message: "timeout", code: "provider_transient" },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toBe(chainError);
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        attempts: [{ message: "timeout", provider: "primary" }],
        errorCode: "provider_transient",
      },
      where: { id: "rank_running_1", status: "running" },
    });
  });

  it("propagates metadata write failure instead of swallowing it", async () => {
    const chainError = new ProviderChainError([
      { provider: "primary", message: "Payment Required", code: "provider_billing" },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockRejectedValue(new Error("connection refused"));

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toThrow("connection refused");
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledTimes(1);
  });

  it("throws a non-retryable closed failure when no running row is updated", async () => {
    const chainError = new ProviderChainError([
      { provider: "primary", message: "Payment Required", code: "provider_billing" },
    ]);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(chainError);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 0 });

    const promise = runRankCheckActivity({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "manual",
    });

    await expect(promise).rejects.toMatchObject({
      nonRetryable: true,
      type: RANK_CHECK_CLOSED_FAILURE,
    });
  });

  it("allows only the run-item CAS winner to reach the paid provider", async () => {
    const item = {
      keywordId: "keyword_1",
      rankCheckId: null as string | null,
      run: { projectId: "project_1" },
      runId: "run_1",
      status: "queued",
    };
    let storedRankCheck: Record<string, unknown> | null = null;
    mocks.prisma.rankCheck.create.mockImplementation(async ({ data }) => {
      storedRankCheck = { ...data, id: "rank_1" };
      return { id: "rank_1", publicId: "check_a00000000000000000000000" };
    });
    mocks.prisma.rankCheck.findUnique.mockImplementation(async () => storedRankCheck);
    mocks.prisma.rankCheckRunItem.findUnique.mockImplementation(async () => ({
      ...item,
      rankCheck: storedRankCheck,
    }));
    mocks.prisma.rankCheckRunItem.updateMany.mockImplementation(async ({ data, where }) => {
      if (where.status !== item.status) return { count: 0 };
      item.rankCheckId = data.rankCheckId;
      item.status = data.status;
      return { count: 1 };
    });
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.paidProvider.fetchRank.mockResolvedValue({ position: 3 });
    mocks.runKeywordCheckWithFallback.mockImplementation(async ({ keywordId, rankCheckId }) => {
      await mocks.paidProvider.fetchRank({ keywordId });
      return {
        attempts: [],
        provider: "primary",
        rankCheck: {
          checkedAt: new Date("2026-09-02T08:00:00.000Z"),
          costCents: 1,
          id: rankCheckId,
          keywordId,
          position: 3,
          rankingUrl: null,
        },
      };
    });

    async function executeClaimant(workflowRunId: string) {
      const running = await createRunningRankCheckActivity(
        runningInput({ runItemId: "item_1", workflowRunId }),
      );
      return runRankCheckActivity({
        keywordId: "keyword_1",
        rankCheckId: running.rankCheckId,
        runItemId: "item_1",
        source: "manual",
      });
    }

    await executeClaimant("workflow_winner");
    await executeClaimant("workflow_loser").catch(() => undefined);

    expect(mocks.paidProvider.fetchRank).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a paid provider call when persistence triggers an activity retry", async () => {
    mocks.paidProvider.fetchRank.mockResolvedValue({ position: 3 });
    mocks.persistProviderResult
      .mockRejectedValueOnce(new Error("database unavailable after provider success"))
      .mockResolvedValueOnce(undefined);
    mocks.runKeywordCheckWithFallback.mockImplementation(async ({ keywordId, rankCheckId }) => {
      await mocks.paidProvider.fetchRank({ keywordId });
      await mocks.persistProviderResult({ rankCheckId });
      return {
        attempts: [],
        provider: "primary",
        rankCheck: {
          checkedAt: new Date("2026-09-02T08:00:00.000Z"),
          costCents: 1,
          id: rankCheckId,
          keywordId,
          position: 3,
          rankingUrl: null,
        },
      };
    });
    mocks.prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    async function executeWithActivityRetry() {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await runRankCheckActivity({
            keywordId: "keyword_1",
            rankCheckId: "rank_1",
            source: "manual",
          });
        } catch (error) {
          const nonRetryable = (error as { nonRetryable?: boolean }).nonRetryable === true;
          if (nonRetryable || attempt === 2) throw error;
        }
      }
    }

    await executeWithActivityRetry().catch(() => undefined);

    expect(mocks.paidProvider.fetchRank).toHaveBeenCalledTimes(1);
  });

  it("records a refused paid-call fence as send_unconfirmed without spend", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:00:00.000Z"));
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      runRankCheckActivity({
        keywordId: "keyword_1",
        rankCheckId: "rank_1",
        runItemId: "item_1",
        source: "manual",
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: "rank_check_paid_call_already_attempted",
    });

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: {
        actualCostCents: null,
        blockedReason: "send_unconfirmed",
        finishedAt: new Date("2026-09-02T08:00:00.000Z"),
        status: "blocked",
      },
      where: { rankCheckId: "rank_1", status: "running" },
    });
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });
});
