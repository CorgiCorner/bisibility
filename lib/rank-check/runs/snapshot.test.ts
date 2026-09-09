import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { operationSnapshotSchema } from "./contract";
import { readOperationSnapshot } from "./snapshot";

const mocks = vi.hoisted(() => ({
  loadProviderChain: vi.fn(),
  activeSearchImport: vi.fn(),
  monthlySpend: vi.fn(),
  keyword: { findMany: vi.fn() },
  rankCheckRun: { findMany: vi.fn() },
  searchAnalyticsImport: { findMany: vi.fn() },
  unitCost: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({ unitCostCentsFor: mocks.unitCost }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/rank-check/budget", () => ({ monthlySpendCents: mocks.monthlySpend }));
vi.mock("@/lib/search-insights/sync/operation-snapshot", () => ({
  readActiveSearchImportSnapshot: mocks.activeSearchImport,
}));

const baseRun = {
  _count: { items: 0 },
  blockedReason: null,
  cancelledCount: 0,
  completedCount: 1,
  costCents: 4,
  deferredCount: 0,
  estimatedCostCents: 6,
  failedCount: 0,
  finishedAt: null,
  items: [{ notBefore: new Date("2026-09-02T10:00:00.000Z") }],
  keywordCount: 2,
  launchedAt: null,
  outcome: null,
  parentRunId: null,
  parentRun: null,
  plannedFor: null,
  project: { budgetCapCents: 5_000, defaults: { serpDepth: 20 } },
  projectId: "project_1",
  requestedCount: 2,
  selectionSpec: { kind: "all", providerId: "serpapi", v: 1 },
  selectionKind: "all",
  skippedCount: 0,
  startedAt: new Date("2026-09-02T08:00:00.000Z"),
  targetCount: 2,
  totalCount: 2,
  trigger: "manual",
};

describe("readOperationSnapshot", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 2, provider: "serpapi", rateContext: { entries: [] } },
    ]);
    mocks.unitCost.mockReturnValue(2);
    mocks.keyword.findMany.mockResolvedValue([]);
    mocks.monthlySpend.mockResolvedValue(0);
    const fixture = [
      { ...baseRun, publicId: "rcr_queued", status: "queued" },
      { ...baseRun, publicId: "rcr_running", status: "running" },
      {
        ...baseRun,
        blockedReason: "provider_unavailable",
        publicId: "rcr_blocked",
        status: "blocked",
      },
      { ...baseRun, publicId: "rcr_planned", status: "planned" },
      { ...baseRun, publicId: "rcr_completed", status: "completed" },
    ];
    mocks.rankCheckRun.findMany.mockImplementation(({ where }) =>
      Promise.resolve(fixture.filter((run) => where.status.in.includes(run.status))),
    );
    mocks.activeSearchImport.mockResolvedValue({
      capabilities: { pause: true, resume: false, retry: false },
      id: "import_1",
      presentation: { action: "pause", supportingText: "Import is running.", title: "Importing" },
      progress: { done: 28, total: 488 },
      property: "sc-domain:example.com",
      state: "running",
    });
  });

  it("maps active runs and imports into validated operation DTOs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:01:00.000Z"));
    const operations = await readOperationSnapshot("project_1");

    expect(operations.map((operation) => operation.id)).toEqual([
      "rcr_queued",
      "rcr_running",
      "rcr_blocked",
      "import_1",
    ]);
    expect(operations).toContainEqual(
      expect.objectContaining({
        counts: {
          cancelled: 0,
          completed: 1,
          deferred: 0,
          failed: 0,
          requested: 2,
          skipped: 0,
          total: 2,
        },
        id: "rcr_running",
        kind: "rank_check",
        etaSeconds: null,
        nextCheckAt: "2026-09-02T10:00:00.000Z",
        provider: "serpapi",
        providerLabel: "SerpApi",
        snapshotAt: "2026-09-02T08:01:00.000Z",
        startedAt: "2026-09-02T08:00:00.000Z",
      }),
    );
    expect(operations.at(-1)).toEqual({
      capabilities: { pause: true, resume: false, retry: false },
      id: "import_1",
      kind: "gsc_import",
      presentation: { action: "pause", supportingText: "Import is running.", title: "Importing" },
      progress: { done: 28, total: 488 },
      property: "sc-domain:example.com",
      state: "running",
    });
    expect(operationSnapshotSchema.array().safeParse(operations).success).toBe(true);
    expect(mocks.rankCheckRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ launchedAt: "desc" }, { id: "desc" }],
        take: 50,
        where: {
          projectId: "project_1",
          status: { in: ["queued", "running", "cancelling", "blocked"] },
        },
      }),
    );
    expect(mocks.activeSearchImport).toHaveBeenCalledWith("project_1");
  });

  it("leaves ETA null until three targets complete", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:01:00.000Z"));
    mocks.rankCheckRun.findMany.mockResolvedValue([
      { ...baseRun, completedCount: 2, publicId: "rcr_running", status: "running" },
    ]);
    mocks.activeSearchImport.mockResolvedValue(null);

    const [operation] = await readOperationSnapshot("project_1");

    expect(operation).toMatchObject({ etaSeconds: null, id: "rcr_running" });
  });

  it("estimates remaining time from completed throughput", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:01:00.000Z"));
    mocks.rankCheckRun.findMany.mockResolvedValue([
      {
        ...baseRun,
        completedCount: 3,
        publicId: "rcr_running",
        status: "running",
        totalCount: 20,
      },
    ]);
    mocks.activeSearchImport.mockResolvedValue(null);

    const [operation] = await readOperationSnapshot("project_1");

    expect(operation).toMatchObject({ etaSeconds: 340, id: "rcr_running" });
  });

  it("emits the public identifier for a parent run", async () => {
    const parentRunId = `rcr_${"p".repeat(24)}`;
    mocks.rankCheckRun.findMany.mockResolvedValue([
      {
        ...baseRun,
        parentRun: { publicId: parentRunId },
        parentRunId: "cm0internalparentid",
        publicId: "rcr_child",
        status: "running",
      },
    ]);

    const operations = await readOperationSnapshot("project_1");

    expect(operations[0]).toEqual(expect.objectContaining({ parentRunId }));
  });

  it("projects an unlaunched blocked occurrence from its current schedule", async () => {
    mocks.rankCheckRun.findMany.mockResolvedValue([
      {
        ...baseRun,
        checkSchedule: {
          id: "schedule_1",
          providerPolicy: null,
          serpDepth: null,
        },
        estimatedCostCents: 40,
        keywordCount: 20,
        publicId: "rcr_blocked_planned",
        requestedCount: 20,
        status: "blocked",
        targetCount: 20,
        totalCount: 20,
      },
    ]);
    mocks.keyword.findMany.mockResolvedValue([
      { device: "desktop", locationId: "market_1", text: "coffee beans" },
    ]);
    mocks.activeSearchImport.mockResolvedValue(null);

    const [operation] = await readOperationSnapshot("project_1");

    expect(operation).toMatchObject({
      counts: expect.objectContaining({ requested: 1, total: 1 }),
      estimatedCostCents: 2,
      keywordCount: 1,
      targetCount: 1,
    });
  });

  it("includes current budget for a budget-blocked operation", async () => {
    mocks.monthlySpend.mockResolvedValue(1_250);
    mocks.rankCheckRun.findMany.mockResolvedValue([
      {
        ...baseRun,
        blockedReason: "budget_exhausted",
        publicId: "rcr_budget_blocked",
        status: "blocked",
      },
    ]);
    mocks.activeSearchImport.mockResolvedValue(null);

    const [operation] = await readOperationSnapshot("project_1");

    expect(operation).toMatchObject({
      budget: { capCents: 5_000, spentCents: 1_250 },
      id: "rcr_budget_blocked",
    });
    expect(mocks.monthlySpend).toHaveBeenCalledWith("project_1", expect.any(Date));
  });
});
