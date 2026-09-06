import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSelectionSpec } from "./selection";

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  assertProviderAllocationAvailable: vi.fn(),
  connect: vi.fn(),
  estimatedCost: vi.fn(),
  lockSelectionRows: vi.fn(),
  loadProviderChain: vi.fn(),
  publishWorkerIntent: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  },
  resolveSelection: vi.fn(),
  tx: {
    auditLog: { create: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { create: vi.fn() },
    rankCheckRunItem: { createMany: vi.fn() },
  },
  verifyToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudgetAvailable,
  isBudgetExhaustedError: (error: { code?: string }) => error?.code === "budget_exhausted",
}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError: class extends Error {},
}));
vi.mock("@/lib/rank-check/default-cost", () => ({
  estimatedRankCheckCostCents: mocks.estimatedCost,
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: mocks.publishWorkerIntent,
}));
vi.mock("@temporalio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@temporalio/client")>();
  return { ...actual, Connection: { ...actual.Connection, connect: mocks.connect } };
});
vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    lockRunSelectionKeywords: mocks.lockSelectionRows,
    resolveRunSelection: mocks.resolveSelection,
  };
});
vi.mock("./preview-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./preview-token")>();
  return { ...actual, verifyPreviewToken: mocks.verifyToken };
});

import { launchRankCheckRun, launchRetryRun } from "./launch";
import { PreviewTokenError } from "./preview-token";

const project = { domain: "example.com", id: "project_1", isSample: false };
const spec: RunSelectionSpec = {
  kind: "selected" as const,
  keywordIds: ["kw_abcdefghijklmnopqrstuvwx", "kw_bcdefghijklmnopqrstuvwxy"],
  v: 1 as const,
};
const input = {
  actorId: "user_1",
  idempotencyKey: "request-0001",
  previewToken: "signed-token",
  project,
  spec,
  trigger: "manual" as const,
};

function keyword(id: string, text: string, status = "completed") {
  return {
    archivedAt: null as Date | null,
    id,
    locationId: "location_active",
    queuedRankCheckTasks: [],
    rankCheckRunItems: [],
    rankChecks: [{ status }],
    schedule: { serpDepth: 50 },
    text,
  };
}

function unrunnable(id: string, text: string, overrides: { archivedAt?: Date; location?: string }) {
  return {
    ...keyword(id, text),
    archivedAt: overrides.archivedAt ?? null,
    locationId: overrides.location ?? "location_active",
  };
}

describe("launchRankCheckRun", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "polling", ok: true });
    mocks.resolveSelection.mockResolvedValue({
      keywordIds: ["keyword_1", "keyword_2"],
      selectionHash: "a".repeat(64),
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("keyword_1", "one"),
      keyword("keyword_2", "two"),
    ]);
    mocks.lockSelectionRows.mockImplementation(async (_tx, _projectId, keywordIds) =>
      [keyword("keyword_1", "one"), keyword("keyword_2", "two")].filter(({ id }) =>
        keywordIds.includes(id),
      ),
    );
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 25, id: "connection_1", provider: "provider-a" },
    ]);
    mocks.estimatedCost.mockReturnValue(25);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.tx.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue(null);
    mocks.tx.rankCheckRun.create.mockResolvedValue({ id: "run_1" });
    mocks.tx.rankCheckRunItem.createMany.mockResolvedValue({ count: 2 });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each(["tampered", "expired", "mismatch"] as const)(
    "rejects a %s token before any database write",
    async (code) => {
      mocks.verifyToken.mockImplementationOnce(() => {
        throw new PreviewTokenError(code);
      });

      await expect(launchRankCheckRun(input)).rejects.toMatchObject({ code });
      expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects a sample project before it can create a run", async () => {
    await expect(
      launchRankCheckRun({ ...input, project: { ...project, isSample: true } }),
    ).rejects.toMatchObject({ code: "sample_project" });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires a tracked domain before it can create a run", async () => {
    await expect(
      launchRankCheckRun({ ...input, project: { ...project, domain: null } }),
    ).rejects.toThrow("This project has no domain yet.");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates the run, items, and audit in one bounded transaction", async () => {
    const launched = await launchRankCheckRun(input);

    expect(launched).toMatchObject({
      estimatedCostCents: 50,
      keywordCount: 2,
      status: "queued",
      targetCount: 2,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
    expect(mocks.tx.rankCheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estimatedCostCents: 50,
        idempotencyKey: "api:request-0001",
        keywordCount: 2,
        orchestrationWorkflowId: expect.stringMatching(/^rank-check-run-rcr_/),
        requestedCount: 2,
        selectionHash: "a".repeat(64),
        selectionKind: "selected",
        status: "queued",
        targetCount: 2,
        totalCount: 2,
      }),
      select: { id: true },
    });
    expect(mocks.tx.rankCheckRunItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ keywordId: "keyword_1", runId: "run_1", status: "queued" }),
        expect.objectContaining({ keywordId: "keyword_2", runId: "run_1", status: "queued" }),
      ],
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.launch",
        targetType: "rank_check_run",
      }),
      mocks.tx,
    );
    // The wake follows the commit; a row the worker can already see is what makes it safe.
    expect(mocks.publishWorkerIntent).toHaveBeenCalledWith("rank_run");
    expect(mocks.publishWorkerIntent.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it("does not create a run when every selected keyword is already in progress", async () => {
    mocks.lockSelectionRows.mockResolvedValueOnce([
      keyword("keyword_1", "one", "running"),
      keyword("keyword_2", "two", "running"),
    ]);

    await expect(launchRankCheckRun(input)).resolves.toEqual({
      message: "All selected keywords already have rank checks in progress.",
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });

    expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
    expect(mocks.tx.rankCheckRunItem.createMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("returns an idempotent existing run without writes or budget checks", async () => {
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValueOnce({
      estimatedCostCents: 50,
      keywordCount: 2,
      publicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "running",
      targetCount: 2,
    });

    await expect(launchRankCheckRun(input)).resolves.toEqual({
      estimatedCostCents: 50,
      keywordCount: 2,
      publicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "running",
      targetCount: 2,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.assertBudgetAvailable).not.toHaveBeenCalled();
  });

  it("namespaces a planner-looking client key before storing it", async () => {
    await launchRankCheckRun({ ...input, idempotencyKey: "plan:sch_1:2026-09-02" });

    expect(mocks.prisma.rankCheckRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_idempotencyKey: {
            idempotencyKey: "api:plan:sch_1:2026-09-02",
            projectId: "project_1",
          },
        },
      }),
    );
    expect(mocks.tx.rankCheckRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: "api:plan:sch_1:2026-09-02" }),
      }),
    );
  });

  it("returns the concurrent idempotent run when the unique write loses a race", async () => {
    const existing = {
      estimatedCostCents: 50,
      keywordCount: 2,
      publicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "queued",
      targetCount: 2,
    };
    mocks.prisma.rankCheckRun.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.prisma.$transaction.mockRejectedValueOnce({ code: "P2002" });

    await expect(launchRankCheckRun(input)).resolves.toEqual(existing);
    expect(mocks.publishWorkerIntent).not.toHaveBeenCalled();
  });

  it("writes queued intent without constructing a connection in worker mode", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "worker");

    await expect(launchRankCheckRun(input)).resolves.toMatchObject({ status: "queued" });

    expect(mocks.tx.rankCheckRun.create).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });

  it("rechecks the whole frozen estimate before opening the transaction", async () => {
    mocks.assertBudgetAvailable.mockRejectedValueOnce(
      Object.assign(new Error("exhausted"), { code: "budget_exhausted" }),
    );

    await expect(launchRankCheckRun(input)).rejects.toMatchObject({
      code: "budget_exhausted",
    });
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 5_000,
      estimatedCostCents: 50,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("asks the database only for runnable rows of the project", async () => {
    await launchRankCheckRun(input);

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          id: { in: ["keyword_1", "keyword_2"] },
          locationId: { in: ["location_active"] },
          projectId: "project_1",
        },
      }),
    );
  });

  it("leaves a paused market and an archived row out of a manual launch", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      keyword("keyword_1", "one"),
      unrunnable("keyword_2", "two", { location: "location_paused" }),
      unrunnable("keyword_3", "three", { archivedAt: new Date("2026-09-01T00:00:00.000Z") }),
    ]);
    mocks.lockSelectionRows.mockResolvedValueOnce([
      keyword("keyword_1", "one"),
      unrunnable("keyword_2", "two", { location: "location_paused" }),
      unrunnable("keyword_3", "three", { archivedAt: new Date("2026-09-01T00:00:00.000Z") }),
    ]);

    await launchRankCheckRun(input);

    expect(mocks.tx.rankCheckRunItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_1" })],
    });
    expect(mocks.tx.rankCheckRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetCount: 1 }) }),
    );
  });

  it("does not let a retry bypass runnability the way it bypasses in-progress work", async () => {
    mocks.resolveSelection.mockResolvedValueOnce({
      keywordIds: ["keyword_1", "keyword_2"],
      selectionHash: "c".repeat(64),
    });
    const busy = { ...keyword("keyword_1", "one"), rankCheckRunItems: [{ status: "running" }] };
    const paused = unrunnable("keyword_2", "two", { location: "location_paused" });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([busy, paused]);
    mocks.lockSelectionRows.mockResolvedValueOnce([keyword("keyword_1", "one"), paused]);
    const parentRun = {
      id: "parent_1",
      items: [
        {
          id: "source_1",
          keyword: { id: "keyword_1", publicId: "kw_abcdefghijklmnopqrstuvwx" },
          status: "failed",
        },
        {
          id: "source_2",
          keyword: { id: "keyword_2", publicId: "kw_bcdefghijklmnopqrstuvwxy" },
          status: "failed",
        },
      ],
      project,
      publicId: "rcr_parentabcdefghijklmnopqrs",
      status: "completed" as const,
    };

    await launchRetryRun({ actorId: "user_1", parentRun, relation: "retry_failed" });

    // The retry keeps the in-progress row and drops the paused one, so the pre-transaction
    // estimate covers exactly one check.
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 5_000,
      estimatedCostCents: 25,
    });
    expect(mocks.tx.rankCheckRunItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_1" })],
    });
  });

  it("runs nothing when the market is paused between the estimate and the transaction", async () => {
    mocks.tx.projectMarket.findMany.mockResolvedValueOnce([]);

    await expect(launchRankCheckRun(input)).resolves.toEqual({
      message: "Every selected keyword is in a market that is not active.",
      outcome: "nothing_to_run",
      reason: "market_inactive",
    });
    expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
    // The worker now owns the workflow start, so "nothing billable happened" is proved by the
    // absence of run items: without them no child rank-check workflow can ever be started.
    expect(mocks.tx.rankCheckRunItem.createMany).not.toHaveBeenCalled();
  });

  it("names archival over market status when the predicate refused every locked row", async () => {
    mocks.lockSelectionRows.mockResolvedValueOnce([
      unrunnable("keyword_1", "one", { archivedAt: new Date("2026-09-01T05:00:00.000Z") }),
      unrunnable("keyword_2", "two", { location: "location_paused" }),
    ]);

    await expect(launchRankCheckRun(input)).resolves.toEqual({
      message: "Every selected keyword has been archived.",
      outcome: "nothing_to_run",
      reason: "keyword_archived",
    });
  });

  // A predicate reason claims something about every selected keyword, so it may only be reported
  // when it holds for every blocked row. One row the predicate still admits makes the in-progress
  // answer the one that is true of the selection.
  it("falls back to the in-progress reason when the blocked rows disagree", async () => {
    mocks.lockSelectionRows.mockResolvedValueOnce([
      unrunnable("keyword_1", "one", { location: "location_paused" }),
      keyword("keyword_2", "two", "running"),
    ]);

    await expect(launchRankCheckRun(input)).resolves.toMatchObject({
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });
  });

  it.each([
    ["retry_failed" as const, "failed"],
    ["retry_deferred" as const, "deferred"],
  ])("creates a %s child from only matching parent items", async (relation, itemStatus) => {
    mocks.resolveSelection.mockResolvedValueOnce({
      keywordIds: ["keyword_1"],
      selectionHash: "b".repeat(64),
    });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([keyword("keyword_1", "one")]);
    const parentRun = {
      id: "parent_1",
      items: [
        {
          id: "source_1",
          keyword: { id: "keyword_1", publicId: "kw_abcdefghijklmnopqrstuvwx" },
          status: itemStatus,
        },
        {
          id: "source_2",
          keyword: { id: "keyword_2", publicId: "kw_bcdefghijklmnopqrstuvwxy" },
          status: "completed",
        },
      ],
      project,
      publicId: "rcr_parentabcdefghijklmnopqrs",
      status: "completed",
    };

    await launchRetryRun({ actorId: "user_1", parentRun, relation });

    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(mocks.tx.rankCheckRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRelation: relation,
          parentRunId: "parent_1",
          selectionKind: relation,
          selectionSpec: { kind: relation, parentRunId: parentRun.publicId, v: 1 },
          trigger: "retry",
        }),
      }),
    );
    expect(mocks.tx.rankCheckRunItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_1", sourceRunItemId: "source_1" })],
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.retry",
        after: { parentRunId: parentRun.publicId, relation },
      }),
      mocks.tx,
    );
  });

  it("refuses retries for active runs or an empty matching subset", async () => {
    const parentRun = {
      id: "parent_1",
      items: [],
      project,
      publicId: "rcr_parentabcdefghijklmnopqrs",
      status: "running",
    };

    expect(() =>
      launchRetryRun({ actorId: "user_1", parentRun, relation: "retry_failed" }),
    ).toThrow("Only completed or cancelled");
    parentRun.status = "completed";
    expect(() =>
      launchRetryRun({ actorId: "user_1", parentRun, relation: "retry_failed" }),
    ).toThrow("no matching items");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
