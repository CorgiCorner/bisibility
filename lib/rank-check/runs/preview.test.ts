import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewRankCheckRun } from "./preview";

const KW_A = "kw_abcdefghijklmnopqrstuvwx";
const KW_B = "kw_bcdefghijklmnopqrstuvwxy";
const KW_C = "kw_cdefghijklmnopqrstuvwxyz";
const HASH = "a".repeat(64);
const project = { domain: "example.com", id: "project_1", isSample: false };

const mocks = vi.hoisted(() => {
  class AllocationError extends Error {}
  return {
    AllocationError,
    assertAllocation: vi.fn(),
    assertBudget: vi.fn(),
    cost: vi.fn(),
    isBudgetError: vi.fn(),
    loadChain: vi.fn(),
    prisma: {
      keyword: { findMany: vi.fn() },
      project: { findUnique: vi.fn() },
      projectMarket: { findMany: vi.fn() },
      rankCheckRun: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    },
    resolveSelection: vi.fn(),
    token: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ PROVIDER_CATALOG: [] }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudget,
  isBudgetExhaustedError: mocks.isBudgetError,
}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
  ProviderAllocationExhaustedError: mocks.AllocationError,
}));
vi.mock("@/lib/rank-check/default-cost", () => ({
  estimatedRankCheckCostCents: mocks.cost,
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadChain,
}));
vi.mock("./selection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./selection")>()),
  resolveRunSelection: mocks.resolveSelection,
}));
vi.mock("./preview-token", () => ({ createPreviewToken: mocks.token }));

function row(
  id: string,
  publicId: string,
  text: string,
  options: {
    archivedAt?: Date;
    heldByRun?: boolean;
    inProgress?: boolean;
    runningInRun?: boolean;
    locationId?: string;
  } = {},
) {
  return {
    archivedAt: options.archivedAt ?? null,
    id,
    locationId: options.locationId ?? "location_active",
    publicId,
    queuedRankCheckTasks: options.inProgress ? [{ state: "ready" }] : [],
    rankCheckRunItems: options.runningInRun
      ? [{ status: "running" }]
      : options.heldByRun
        ? [{ status: "queued" }]
        : [],
    rankChecks: [],
    schedule: { serpDepth: 50 },
    text,
  };
}

function spec(keywordIds: `kw_${string}`[] = [KW_A, KW_B, KW_C]) {
  return { kind: "selected" as const, keywordIds, v: 1 as const };
}

describe("rank-check run preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSelection.mockResolvedValue({
      keywordIds: ["internal_a", "internal_b", "internal_c"],
      selectionHash: HASH,
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 100,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "shared text"),
      row("internal_b", KW_B, "shared text"),
      row("internal_c", KW_C, "distinct text"),
    ]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRun.findFirst.mockResolvedValue(null);
    mocks.prisma.rankCheckRun.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheckRun.count.mockResolvedValue(0);
    mocks.loadChain.mockResolvedValue([
      {
        costPerCheckCents: 10,
        credentialsEncrypted: "encrypted",
        id: "connection_1",
        provider: "provider-a",
      },
    ]);
    mocks.cost.mockReturnValue(10);
    mocks.assertBudget.mockResolvedValue({ capCents: 100, spentCents: 20 });
    mocks.isBudgetError.mockReturnValue(false);
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 50 });
    mocks.token.mockReturnValue({
      expiresAt: new Date("2026-09-02T10:10:00.000Z"),
      token: "signed-token",
    });
  });

  it("rejects a sample project before calculating a preview", async () => {
    await expect(
      previewRankCheckRun({
        origin: APP_REQUEST_ORIGIN,
        project: { ...project, isSample: true },
        spec: spec(),
      }),
    ).rejects.toMatchObject({ code: "sample_project" });

    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.loadChain).not.toHaveBeenCalled();
  });

  it("requires a tracked domain before calculating a preview", async () => {
    await expect(
      previewRankCheckRun({
        origin: APP_REQUEST_ORIGIN,
        project: { ...project, domain: null },
        spec: spec(),
      }),
    ).rejects.toThrow("This project has no domain yet.");

    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.loadChain).not.toHaveBeenCalled();
  });

  it("sums known target costs and never converts an unknown cost to zero", async () => {
    mocks.cost
      .mockReset()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(20);

    const result = await previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec() });

    expect(result).toMatchObject({
      estimate: { costCents: 30, perTargetCents: null, unknownCostTargets: 1 },
      executable: 3,
      keywordCount: 2,
      matched: 3,
      targetCount: 3,
    });
    expect(mocks.assertBudget).toHaveBeenCalledWith(
      "project_1",
      expect.any(Date),
      expect.objectContaining({ estimatedCostCents: 30 }),
    );
  });

  it("returns null total cost when every executable target has unknown cost", async () => {
    mocks.cost.mockReturnValue(null);

    await expect(
      previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec() }),
    ).resolves.toMatchObject({
      estimate: { costCents: null, unknownCostTargets: 3 },
    });
  });

  it("reports selected IDs outside the project and in-progress targets", async () => {
    mocks.resolveSelection.mockResolvedValue({ keywordIds: ["internal_a"], selectionHash: HASH });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "text", { inProgress: true }),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A, KW_B]),
    });

    expect(result.matched).toBe(1);
    expect(result.excluded).toEqual([
      { keywordId: KW_B, reason: "other_project" },
      { keywordId: KW_A, reason: "in_progress" },
    ]);
    expect(result.executable).toBe(0);
  });

  it("signs the estimate launch will verify when another active run holds a keyword", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "held text", { heldByRun: true }),
      row("internal_b", KW_B, "free text"),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A, KW_B]),
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ publicId: true, rankCheckRunItems: expect.any(Object) }),
      }),
    );
    expect(result.excluded).toContainEqual({ keywordId: KW_A, reason: "in_progress" });
    expect(result.executable).toBe(1);
    expect(mocks.token).toHaveBeenCalledWith(expect.objectContaining({ estimateCents: 10 }));
  });

  it("blocks the legacy branch when the whole estimate exceeds remaining budget", async () => {
    const budgetError = Object.assign(new Error("budget"), {
      budget: { capCents: 100, projectId: "project_1", spentCents: 80 },
    });
    mocks.assertBudget.mockRejectedValue(budgetError);
    mocks.isBudgetError.mockImplementation((error) => error === budgetError);

    await expect(
      previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec() }),
    ).resolves.toMatchObject({
      budget: {
        blocked: true,
        capCents: 100,
        mode: "legacy",
        reason: "budget_exhausted",
        remainingAfterCents: 0,
        spentCents: 80,
      },
    });
  });

  it("uses provider allocation enforcement after allocation initialization", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 100,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      depth: 50,
      project,
      spec: spec(),
    });

    expect(result.budget).toMatchObject({ blocked: false, mode: "allocation", reason: null });
    expect(mocks.assertBudget).not.toHaveBeenCalled();
    expect(mocks.assertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection_1",
        estimatedCostCents: 30,
        estimatedUsageQuantity: 15,
        projectId: "project_1",
        provider: "provider-a",
      }),
      mocks.prisma,
    );
  });

  it("uses the programmatic cap for a programmatic origin and reports the blocked surface", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 100,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const exhausted = Object.assign(new mocks.AllocationError("allocation reached"), {
      surface: "programmatic" as const,
    });
    mocks.assertAllocation.mockRejectedValue(exhausted);

    const result = await previewRankCheckRun({
      origin: { credential: { id: "key_1", kind: "project_key" }, source: "api" },
      project,
      spec: spec(),
    });

    expect(mocks.assertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "programmatic" }),
      mocks.prisma,
    );
    expect(result.budget).toMatchObject({
      blocked: true,
      mode: "allocation",
      reason: "budget_exhausted",
      surface: "programmatic",
    });
  });

  it("blocks an empty provider chain and excludes otherwise executable targets", async () => {
    mocks.loadChain.mockResolvedValue([]);

    const result = await previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec() });

    expect(result.budget).toMatchObject({ blocked: true, reason: "no_provider" });
    expect(result.excluded).toEqual([
      { keywordId: KW_A, reason: "no_provider" },
      { keywordId: KW_B, reason: "no_provider" },
      { keywordId: KW_C, reason: "no_provider" },
    ]);
    expect(result.targetCount).toBe(0);
  });

  it("excludes a paused market's keyword and names the market as the reason", async () => {
    mocks.resolveSelection.mockResolvedValue({ keywordIds: ["internal_a"], selectionHash: HASH });
    mocks.prisma.keyword.findMany.mockResolvedValue([row("internal_a", KW_A, "text")]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A]),
    });

    expect(result.excluded).toEqual([{ keywordId: KW_A, reason: "market_inactive" }]);
    expect(result).toMatchObject({
      estimate: { costCents: null },
      executable: 0,
      targetCount: 0,
    });
  });

  it("excludes a keyword whose market row was removed", async () => {
    mocks.resolveSelection.mockResolvedValue({ keywordIds: ["internal_a"], selectionHash: HASH });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "text", { locationId: "location_removed" }),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A]),
    });

    expect(result.excluded).toEqual([{ keywordId: KW_A, reason: "market_inactive" }]);
    expect(result.executable).toBe(0);
  });

  it("excludes an archived keyword and names the archive as the reason", async () => {
    mocks.resolveSelection.mockResolvedValue({ keywordIds: ["internal_a"], selectionHash: HASH });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "text", { archivedAt: new Date("2026-09-01T05:00:00.000Z") }),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A]),
    });

    expect(result.excluded).toEqual([{ keywordId: KW_A, reason: "keyword_archived" }]);
    expect(result.executable).toBe(0);
  });

  it("signs the empty estimate a guarded launch reproduces when nothing is runnable", async () => {
    mocks.resolveSelection.mockResolvedValue({ keywordIds: ["internal_a"], selectionHash: HASH });
    mocks.prisma.keyword.findMany.mockResolvedValue([row("internal_a", KW_A, "text")]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    await previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec([KW_A]) });

    expect(mocks.token).toHaveBeenCalledWith({
      depth: null,
      estimateCents: -1,
      projectId: "project_1",
      providerId: null,
      selectionHash: HASH,
      trigger: "api",
    });
  });

  it("reads the active market registry for the previewed project", async () => {
    await previewRankCheckRun({ origin: APP_REQUEST_ORIGIN, project, spec: spec() });

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  it("blocks a duplicate active selection before budget enforcement", async () => {
    mocks.prisma.rankCheckRun.findFirst.mockResolvedValue({ id: "run_1" });

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      providerId: "provider-a",
      spec: spec(),
    });

    expect(result.budget).toMatchObject({ blocked: true, reason: "duplicate" });
    expect(mocks.assertBudget).not.toHaveBeenCalled();
    expect(mocks.token).toHaveBeenCalledWith({
      depth: null,
      estimateCents: 30,
      projectId: "project_1",
      providerId: "provider-a",
      selectionHash: HASH,
      trigger: "api",
    });
    expect(result.overlaps).toEqual([]);
    expect(mocks.prisma.rankCheckRun.findMany).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "failed", "deferred"])(
    "allows another manual check after a %s run when the next scheduled run is only planned",
    async (outcome) => {
      const runs = [
        { id: "previous_manual", outcome, status: "completed" },
        { id: "next_scheduled", outcome: null, status: "planned" },
      ];
      mocks.prisma.rankCheckRun.findFirst.mockImplementation(
        ({ where }: { where: { status: { in: string[] } } }) =>
          Promise.resolve(runs.find((run) => where.status.in.includes(run.status)) ?? null),
      );

      const result = await previewRankCheckRun({
        origin: APP_REQUEST_ORIGIN,
        project,
        spec: spec(),
      });

      expect(result.executable).toBe(3);
      expect(result.budget).toMatchObject({ blocked: false, reason: null });
      expect(mocks.assertBudget).toHaveBeenCalled();
    },
  );

  it.each(["queued", "running", "cancelling", "blocked"])(
    "still prevents a duplicate manual check while the same scope is %s",
    async (status) => {
      mocks.prisma.rankCheckRun.findFirst.mockImplementation(
        ({ where }: { where: { status: { in: string[] } } }) =>
          Promise.resolve(where.status.in.includes(status) ? { id: "active_run" } : null),
      );

      const result = await previewRankCheckRun({
        origin: APP_REQUEST_ORIGIN,
        project,
        spec: spec(),
      });

      expect(result.budget).toMatchObject({ blocked: true, reason: "duplicate" });
      expect(mocks.assertBudget).not.toHaveBeenCalled();
    },
  );
});

describe("manual rank-check run preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSelection.mockResolvedValue({
      keywordIds: ["internal_a", "internal_b", "internal_c"],
      selectionHash: HASH,
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 100,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRun.findFirst.mockResolvedValue({ id: "active_run" });
    mocks.prisma.rankCheckRun.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheckRun.count.mockResolvedValue(0);
    mocks.loadChain.mockResolvedValue([
      { costPerCheckCents: 10, id: "connection_1", provider: "provider-a" },
    ]);
    mocks.cost.mockReturnValue(10);
    mocks.assertBudget.mockResolvedValue({ capCents: 100, spentCents: 20 });
    mocks.isBudgetError.mockReturnValue(false);
    mocks.token.mockReturnValue({ expiresAt: new Date("2026-09-02T10:10:00.000Z"), token: "t" });
  });

  it("keeps keywords that only wait in another run's queue and never blocks a duplicate", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "queued elsewhere", { heldByRun: true }),
      row("internal_b", KW_B, "free"),
      row("internal_c", KW_C, "at the provider", { runningInRun: true }),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec(),
      trigger: "manual",
    });

    expect(result.excluded).toEqual([{ keywordId: KW_C, reason: "in_progress" }]);
    expect(result.executable).toBe(2);
    expect(result.budget).toMatchObject({ blocked: false, reason: null });
    expect(mocks.prisma.rankCheckRun.findFirst).not.toHaveBeenCalled();
    expect(mocks.token).toHaveBeenCalledWith(
      expect.objectContaining({ estimateCents: 20, trigger: "manual" }),
    );
  });

  it("leaves out a keyword whose provider task or rank check is in flight", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "task", { inProgress: true }),
      { ...row("internal_b", KW_B, "check"), rankChecks: [{ status: "running" }] },
      row("internal_c", KW_C, "free"),
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec(),
      trigger: "manual",
    });

    expect(result.excluded).toEqual([
      { keywordId: KW_A, reason: "in_progress" },
      { keywordId: KW_B, reason: "in_progress" },
    ]);
    expect(result.executable).toBe(1);
  });

  it("reports active runs first, then scheduled occurrences, over the executable keywords", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "queued elsewhere", { heldByRun: true }),
      row("internal_b", KW_B, "free"),
      row("internal_c", KW_C, "at the provider", { runningInRun: true }),
    ]);
    const createdAt = new Date("2026-09-25T08:00:00.000Z");
    mocks.prisma.rankCheckRun.findMany
      .mockResolvedValueOnce([
        {
          _count: { items: 1 },
          createdAt,
          launchedAt: new Date("2026-09-25T08:01:00.000Z"),
          plannedFor: null,
          publicId: "rcr_queued",
          status: "queued",
        },
      ])
      .mockResolvedValueOnce([
        {
          checkSchedule: { _count: { keywords: 2 } },
          createdAt,
          launchedAt: null,
          plannedFor: new Date("2026-09-25T14:00:00.000Z"),
          publicId: "rcr_planned",
          status: "planned",
        },
        {
          checkSchedule: { _count: { keywords: 0 } },
          createdAt,
          launchedAt: null,
          plannedFor: new Date("2026-09-25T15:00:00.000Z"),
          publicId: "rcr_empty",
          status: "planned",
        },
      ]);
    mocks.prisma.rankCheckRun.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec(),
      trigger: "manual",
    });

    expect(result.overlaps).toEqual([
      {
        at: "2026-09-25T08:01:00.000Z",
        canCancel: true,
        keywordCount: 1,
        runId: "rcr_queued",
        status: "queued",
      },
      {
        at: "2026-09-25T14:00:00.000Z",
        canCancel: true,
        keywordCount: 2,
        runId: "rcr_planned",
        status: "planned",
      },
    ]);
    expect(result.overlapRunCount).toBe(3);
    const [activeQuery, scheduledQuery] = mocks.prisma.rankCheckRun.findMany.mock.calls.map(
      ([query]) => query,
    );
    expect(activeQuery).toMatchObject({
      take: 5,
      where: {
        items: {
          some: {
            keywordId: { in: ["internal_a", "internal_b"] },
            status: { in: ["queued", "running"] },
          },
        },
        projectId: "project_1",
        status: { in: ["queued", "running", "cancelling"] },
      },
    });
    expect(scheduledQuery).toMatchObject({
      take: 5,
      where: {
        checkSchedule: {
          archivedAt: null,
          enabled: true,
          keywords: { some: { id: { in: ["internal_a", "internal_b"] } } },
        },
        OR: [{ status: "blocked" }, { plannedFor: { lte: expect.any(Date) }, status: "planned" }],
      },
    });
  });

  it("does not offer to cancel a run that already sends checks", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      row("internal_a", KW_A, "held", { heldByRun: true }),
    ]);
    mocks.prisma.rankCheckRun.findMany.mockResolvedValueOnce([
      {
        _count: { items: 1 },
        createdAt: new Date("2026-09-25T08:00:00.000Z"),
        launchedAt: null,
        plannedFor: null,
        publicId: "rcr_running",
        status: "running",
      },
    ]);

    const result = await previewRankCheckRun({
      origin: APP_REQUEST_ORIGIN,
      project,
      spec: spec([KW_A]),
      trigger: "manual",
    });

    expect(result.overlaps).toEqual([
      expect.objectContaining({ at: "2026-09-25T08:00:00.000Z", canCancel: false }),
    ]);
  });
});
