import { beforeEach, describe, expect, it, vi } from "vitest";
import { launchDuePlannedRuns, launchPlannedRun } from "./launch-due";

const mocks = vi.hoisted(() => ({
  activeLocationIds: ["location_active"],
  archived: new Set<string>(),
  assertBudget: vi.fn(),
  createMany: vi.fn(),
  findMarkets: vi.fn(),
  keywordLocations: new Map<string, string>(),
  deleteMany: vi.fn(),
  findKeywords: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  currentSchedule: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  isBudgetExhausted: vi.fn(),
  loadChain: vi.fn(),
  occurrenceKeys: new Map<string, string>(),
  items: new Map<string, { id: string }[]>(),
  members: new Map<string, { id: string }[]>(),
  queryRaw: vi.fn(),
  status: new Map<string, string>(),
  transaction: vi.fn(),
  txUpdateMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    rankCheckRun: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany,
    },
    keyword: { findMany: mocks.findKeywords },
    projectMarket: { findMany: mocks.findMarkets },
    rankCheckRunItem: { createMany: mocks.createMany, deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadChain,
}));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudget,
  isBudgetExhaustedError: mocks.isBudgetExhausted,
}));

function updateStatus({
  data,
  where,
}: {
  data: { status?: string };
  where: { id: string; status?: string };
}) {
  const current = mocks.status.get(where.id);
  if (where.status && current !== where.status) return Promise.resolve({ count: 0 });
  if (data.status) mocks.status.set(where.id, data.status);
  return Promise.resolve({ count: 1 });
}

function run(id: string) {
  return {
    checkSchedule: {
      cronExpression: null,
      enabled: true,
      frequency: "daily",
      jitterMinutes: 0,
      keywords: mocks.members.get(id) ?? [],
      providerPolicy: null,
      publicId: "sch_a00000000000000000000000",
      serpDepth: 20,
      timeOfDay: "08:00",
      timezone: "UTC",
    },
    project: {
      budgetCapCents: 100,
      defaults: { serpDepth: 20, timezone: "UTC" },
      providerAllocationsInitializedAt: null,
    },
    projectId: "project_1",
    selectionSpec: { occurrenceKey: mocks.occurrenceKeys.get(id) ?? "2026-09-02" },
    status: mocks.status.get(id),
    items: mocks.items.get(id) ?? [],
  };
}

function candidate(id: string, inProgress = false) {
  return {
    archivedAt: mocks.archived.has(id) ? new Date("2026-09-01T00:00:00.000Z") : null,
    id,
    locationId: mocks.keywordLocations.get(id) ?? "location_active",
    queuedRankCheckTasks: inProgress ? [{ state: "prepared" }] : [],
    rankCheckRunItems: inProgress ? [{ status: "queued" }] : [],
    rankChecks: [],
    schedule: null,
    text: id,
  };
}

type KeywordWhere = {
  archivedAt?: null;
  id: { in: string[] };
  locationId?: { in: string[] };
};

function matchesKeywordWhere(row: ReturnType<typeof candidate>, where: KeywordWhere) {
  if (where.archivedAt === null && row.archivedAt !== null) return false;
  if (where.locationId && !where.locationId.in.includes(row.locationId)) return false;
  return true;
}

describe("planned run launching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeLocationIds = ["location_active"];
    mocks.archived.clear();
    mocks.keywordLocations.clear();
    mocks.items.clear();
    mocks.members.clear();
    mocks.occurrenceKeys.clear();
    mocks.status.clear();
    mocks.updateMany.mockImplementation(updateStatus);
    mocks.txUpdateMany.mockImplementation(updateStatus);
    mocks.currentSchedule.mockResolvedValue({ id: "schedule" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: mocks.queryRaw,
        checkSchedule: { findFirst: mocks.currentSchedule },
        keyword: { findMany: mocks.findKeywords },
        projectMarket: { findMany: mocks.findMarkets },
        rankCheckRun: { updateMany: mocks.txUpdateMany },
        rankCheckRunItem: { createMany: mocks.createMany, deleteMany: mocks.deleteMany },
      }),
    );
    mocks.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(mocks.status.has(where.id) ? run(where.id) : null),
    );
    mocks.findUniqueOrThrow.mockImplementation(({ where }) =>
      Promise.resolve({ orchestrationWorkflowId: `rank-check-run-${where.id}` }),
    );
    mocks.findKeywords.mockImplementation(({ where }: { where: KeywordWhere }) =>
      Promise.resolve(
        where.id.in.map((id) => candidate(id)).filter((row) => matchesKeywordWhere(row, where)),
      ),
    );
    mocks.findMarkets.mockImplementation(() =>
      Promise.resolve(mocks.activeLocationIds.map((locationId) => ({ locationId }))),
    );
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    mocks.loadChain.mockResolvedValue([
      {
        costPerCheckCents: 2,
        id: "connection_1",
        provider: "serpapi",
        rateContext: { entries: [], manualAmountCents: null },
      },
    ]);
    mocks.assertBudget.mockResolvedValue({ capCents: 100, spentCents: 0 });
    mocks.isBudgetExhausted.mockReturnValue(false);
  });

  it("rejects a run whose schedule is archived during launch admission", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    mocks.currentSchedule.mockResolvedValue(null);
    const start = vi.fn();
    await launchPlannedRun("run_1", start, new Date("2026-09-02T08:00:00.000Z"));
    expect(start).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.currentSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null, enabled: true, projectId: "project_1" }),
      }),
    );
  });

  it("replaces old planned items with the members remaining at launch", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    const startRun = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-09-02T08:00:00.000Z");

    await expect(launchPlannedRun("run_1", startRun, now)).resolves.toEqual({
      launched: true,
      runId: "run_1",
    });

    expect(mocks.status.get("run_1")).toBe("queued");
    expect(mocks.txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keywordCount: 1,
          requestedCount: 1,
          startedAt: null,
          status: "queued",
          targetCount: 1,
          totalCount: 1,
        }),
        where: { id: "run_1", status: "planned" },
      }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { rankCheckId: null, runId: "run_1", status: "queued" },
    });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        {
          estimatedCostCents: 2,
          keywordId: "keyword_1",
          notBefore: now,
          runId: "run_1",
          status: "queued",
        },
      ],
    });
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createMany.mock.invocationCallOrder[0] as number,
    );
  });

  it("materializes members added after planning", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }, { id: "keyword_2" }]);

    await expect(
      launchPlannedRun("run_1", vi.fn().mockResolvedValue(undefined)),
    ).resolves.toMatchObject({
      launched: true,
    });

    expect(mocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ keywordId: "keyword_1" }),
          expect.objectContaining({ keywordId: "keyword_2" }),
        ],
      }),
    );
  });

  it("finalizes a zero-member occurrence as deferred without starting work", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", []);
    const startRun = vi.fn();
    const now = new Date("2026-09-02T08:00:00.000Z");

    await expect(launchPlannedRun("run_1", startRun, now)).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.status.get("run_1")).toBe("completed");
    expect(mocks.loadChain).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
    expect(mocks.txUpdateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ outcome: "deferred", startedAt: null, status: "completed" }),
      where: { id: "run_1", status: "planned" },
    });
  });

  it("keeps blocked admission checks based on the current members", async () => {
    mocks.status.set("run_1", "blocked");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    const exhausted = new Error("budget exhausted");
    mocks.assertBudget.mockRejectedValue(exhausted);
    mocks.isBudgetExhausted.mockImplementation((error) => error === exhausted);

    await expect(launchPlannedRun("run_1", vi.fn())).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.assertBudget).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 100,
      estimatedCostCents: 2,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { blockedReason: "budget_exhausted", status: "blocked" },
      where: { id: "run_1", status: "blocked" },
    });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("materializes a blocked occurrence only when it has no items yet", async () => {
    mocks.status.set("run_1", "blocked");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    const startRun = vi.fn().mockResolvedValue(undefined);

    await expect(launchPlannedRun("run_1", startRun)).resolves.toEqual({
      launched: true,
      runId: "run_1",
    });

    expect(mocks.createMany).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(startRun).toHaveBeenCalledOnce();
  });

  it("restarts a blocked materialized run without a second paid dispatch or orphaning its item", async () => {
    mocks.status.set("run_1", "blocked");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    mocks.items.set("run_1", [{ id: "item_1" }]);
    const paidProviderCall = vi.fn().mockResolvedValue(undefined);

    await expect(launchPlannedRun("run_1", paidProviderCall)).resolves.toEqual({
      launched: true,
      runId: "run_1",
    });

    expect(paidProviderCall).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.items.get("run_1")).toEqual([{ id: "item_1" }]);
    expect(mocks.status.get("run_1")).toBe("queued");
  });

  it("launches only due planned runs from a tick", async () => {
    mocks.status.set("run_due", "planned");
    mocks.members.set("run_due", [{ id: "keyword_1" }]);
    mocks.findMany.mockResolvedValue([{ id: "run_due" }]);
    const startRun = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-09-02T08:00:00.000Z");

    await expect(launchDuePlannedRuns({ now, startRun })).resolves.toEqual({
      cursor: null,
      hasMore: false,
      launched: 1,
      scanned: 1,
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plannedFor: { lte: now }, status: { in: ["blocked", "planned"] } },
      }),
    );
  });

  it("expires an unmaterialized blocked occurrence older than one cadence interval", async () => {
    mocks.status.set("run_1", "blocked");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    const now = new Date("2026-09-03T08:00:00.000Z");

    await expect(launchPlannedRun("run_1", vi.fn(), now)).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: {
        blockedReason: "occurrence_expired",
        finishedAt: now,
        outcome: "deferred",
        status: "completed",
      },
      where: { id: "run_1", status: "blocked" },
    });
  });

  it("launches only the most recent blocked occurrence after budget capacity returns", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    mocks.status.set("older", "blocked");
    mocks.status.set("latest", "blocked");
    mocks.members.set("older", [{ id: "keyword_1" }]);
    mocks.members.set("latest", [{ id: "keyword_1" }]);
    mocks.occurrenceKeys.set("older", "2026-09-01");
    const startRun = vi.fn().mockResolvedValue(undefined);

    await expect(launchPlannedRun("older", startRun, now)).resolves.toEqual({
      launched: false,
      runId: "older",
    });
    await expect(launchPlannedRun("latest", startRun, now)).resolves.toEqual({
      launched: true,
      runId: "latest",
    });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ blockedReason: "occurrence_expired", status: "completed" }),
      where: { id: "older", status: "blocked" },
    });
  });

  it("uses the last due run as a keyset cursor when blocked rows fill a page", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    mocks.findMany.mockResolvedValue([
      { id: "blocked_1", plannedFor: now },
      { id: "blocked_2", plannedFor: now },
    ]);

    await expect(launchDuePlannedRuns({ limit: 1, now, startRun: vi.fn() })).resolves.toEqual({
      cursor: { id: "blocked_1", plannedFor: now.toISOString() },
      hasMore: true,
      launched: 0,
      scanned: 1,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plannedFor: { lte: now }, status: { in: ["blocked", "planned"] } },
      }),
    );
  });

  it("skips members with a shared in-progress predicate before materialization", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }, { id: "keyword_2" }]);
    mocks.findKeywords
      .mockResolvedValueOnce([candidate("keyword_1", true), candidate("keyword_2")])
      .mockResolvedValueOnce([candidate("keyword_2")]);

    await launchPlannedRun("run_1", vi.fn().mockResolvedValue(undefined));

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_2" })],
    });
    expect(mocks.txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skippedCount: 1, targetCount: 1 }),
      }),
    );
  });

  it("does not materialize when a manual run claims a keyword after the precheck", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    mocks.findKeywords
      .mockResolvedValueOnce([candidate("keyword_1")])
      .mockResolvedValueOnce([candidate("keyword_1", true)]);
    const startRun = vi.fn();

    await expect(launchPlannedRun("run_1", startRun)).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.txUpdateMany).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
    expect(mocks.status.get("run_1")).toBe("planned");
  });
  it("plans only the active market's rows across active, paused and removed markets", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [
      { id: "keyword_active" },
      { id: "keyword_paused" },
      { id: "keyword_removed" },
    ]);
    mocks.keywordLocations.set("keyword_paused", "location_paused");
    mocks.keywordLocations.set("keyword_removed", "location_removed");

    await expect(
      launchPlannedRun("run_1", vi.fn().mockResolvedValue(undefined)),
    ).resolves.toMatchObject({ launched: true });

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_active" })],
    });
    expect(mocks.txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestedCount: 3, skippedCount: 2, targetCount: 1 }),
      }),
    );
  });

  it("excludes an archived keyword that still sits in an active market", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_active" }, { id: "keyword_archived" }]);
    mocks.archived.add("keyword_archived");

    await launchPlannedRun("run_1", vi.fn().mockResolvedValue(undefined));

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_active" })],
    });
  });

  it("keeps a schedule firing for its active market when another market is paused", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_active" }, { id: "keyword_paused" }]);
    mocks.keywordLocations.set("keyword_paused", "location_paused");
    const startRun = vi.fn().mockResolvedValue(undefined);

    await expect(launchPlannedRun("run_1", startRun)).resolves.toEqual({
      launched: true,
      runId: "run_1",
    });

    expect(startRun).toHaveBeenCalledWith({
      runId: "run_1",
      workflowId: "rank-check-run-run_1",
    });
    expect(mocks.status.get("run_1")).toBe("queued");
  });

  it("defers the occurrence when every market of the run has been paused", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    mocks.activeLocationIds = [];
    const startRun = vi.fn();

    await expect(launchPlannedRun("run_1", startRun)).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.status.get("run_1")).toBe("completed");
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("does not materialize when the market is paused after the precheck", async () => {
    mocks.status.set("run_1", "planned");
    mocks.members.set("run_1", [{ id: "keyword_1" }]);
    mocks.findMarkets
      .mockResolvedValueOnce([{ locationId: "location_active" }])
      .mockResolvedValueOnce([]);
    const startRun = vi.fn();

    await expect(launchPlannedRun("run_1", startRun)).resolves.toEqual({
      launched: false,
      runId: "run_1",
    });

    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.txUpdateMany).not.toHaveBeenCalled();
    expect(mocks.status.get("run_1")).toBe("planned");
  });
});
