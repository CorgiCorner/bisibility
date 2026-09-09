import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gscCount: vi.fn(),
  gscFindMany: vi.fn(),
  projectFindUnique: vi.fn(),
  rankCount: vi.fn(),
  rankFindMany: vi.fn(),
  readActiveSearchImportSnapshot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFindUnique },
    rankCheckRun: { count: mocks.rankCount, findMany: mocks.rankFindMany },
    searchAnalyticsImport: { count: mocks.gscCount, findMany: mocks.gscFindMany },
  },
}));
vi.mock("@/lib/search-insights/sync/operation-snapshot", () => ({
  readActiveSearchImportSnapshot: mocks.readActiveSearchImportSnapshot,
}));

import { listProjectRuns } from "./project-runs-query";

const project = {
  id: "project_1",
  name: "Example project",
  publicId: "prj_a00000000000000000000000",
};
const runId = "rcr_a00000000000000000000000";

function rankRow(overrides: Record<string, unknown> = {}) {
  const at = new Date("2026-09-06T12:00:00.000Z");
  return {
    blockedReason: null,
    completedCount: 2,
    costCents: 12,
    createdAt: at,
    estimatedCostCents: 12,
    finishedAt: at,
    keywordCount: 2,
    launchedAt: at,
    outcome: "succeeded",
    plannedFor: null,
    publicId: runId,
    startedAt: at,
    status: "completed",
    targetCount: 2,
    totalCount: 2,
    trigger: "manual",
    ...overrides,
  };
}

function importRow(overrides: Record<string, unknown> = {}) {
  const at = new Date("2026-09-06T11:00:00.000Z");
  return {
    createdAt: at,
    daysDone: 28,
    daysTotal: 28,
    id: "import_1",
    lastProbeAt: at,
    lastSyncFinishedAt: at,
    lastSyncStartedAt: at,
    pausedReason: null,
    projectId: project.id,
    property: "sc-domain:example.com",
    searchType: "web",
    source: "gsc",
    state: "completed",
    syncStartedAt: at,
    ...overrides,
  };
}

function activeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: { pause: true, resume: false, retry: false },
    id: "import_current",
    presentation: {
      action: "pause",
      kind: "running",
      supportingText: "Import is running.",
      title: "Importing",
    },
    progress: { done: 28, total: 488 },
    property: "sc-domain:example.com",
    state: "running",
    ...overrides,
  };
}

describe("project runs database query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rankFindMany.mockResolvedValue([]);
    mocks.rankCount.mockResolvedValue(0);
    mocks.rankFindMany.mockResolvedValueOnce([rankRow()]).mockResolvedValueOnce([
      rankRow({
        finishedAt: new Date("2026-09-06T09:00:00.000Z"),
        launchedAt: null,
        publicId: "rcr_b00000000000000000000000",
        status: "cancelled",
      }),
    ]);
    mocks.gscFindMany.mockResolvedValue([
      importRow({ id: "import_current", state: "running" }),
      importRow({ createdAt: new Date("2026-09-06T10:00:00.000Z"), id: "import_completed" }),
      importRow({ id: "import_ga4", source: "ga4" }),
    ]);
    mocks.rankCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mocks.gscCount.mockResolvedValue(2);
    mocks.readActiveSearchImportSnapshot.mockResolvedValue(activeSnapshot());
  });

  it("returns durable current and completed imports without admitting GA4 or a snapshot cap", async () => {
    const result = await listProjectRuns(project, {
      cursor: null,
      limit: 20,
      source: "all",
      status: "all",
      view: "runs",
    });

    expect(result.counts).toEqual({ rankChecks: 2, searchConsole: 2, total: 4 });
    expect(result.runs.map((run) => run.id)).toEqual([
      runId,
      "import_current",
      "import_completed",
      "rcr_b00000000000000000000000",
    ]);
    expect(result.runs.find((run) => run.id === "import_current")).toMatchObject({
      kind: "gsc_import",
      progress: { completed: 28, total: 488, unit: "days" },
    });
    expect(result.runs.find((run) => run.id === "import_completed")).toMatchObject({
      kind: "gsc_import",
      progress: { completed: null, total: null, unit: "days" },
    });
    expect(result.runs.map((run) => run.id)).not.toContain("import_ga4");
    expect(mocks.rankFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
    expect(mocks.gscFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
    expect(JSON.stringify(mocks.gscFindMany.mock.calls[0]?.[0]?.where)).toContain('"source":"gsc"');
    expect(JSON.stringify(mocks.gscFindMany.mock.calls[0]?.[0]?.where)).toContain(
      '"searchType":"web"',
    );
    expect(mocks.readActiveSearchImportSnapshot).toHaveBeenCalledOnce();
    expect(mocks.readActiveSearchImportSnapshot).toHaveBeenCalledWith(project.id);
  });

  it("moves a delayed canonical active import from active to attention before counts and paging", async () => {
    mocks.rankFindMany.mockReset();
    mocks.rankCount.mockReset();
    mocks.gscFindMany.mockReset();
    mocks.gscCount.mockReset();
    mocks.gscFindMany.mockResolvedValue([importRow({ id: "import_current", state: "running" })]);
    mocks.gscCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.readActiveSearchImportSnapshot.mockResolvedValue(
      activeSnapshot({
        presentation: {
          action: null,
          kind: "waiting_worker",
          supportingText: "The active worker is unavailable.",
          title: "Delayed",
        },
      }),
    );

    const active = await listProjectRuns(project, {
      cursor: null,
      limit: 20,
      source: "search_console",
      status: "active",
      view: "runs",
    });
    const attention = await listProjectRuns(project, {
      cursor: null,
      limit: 20,
      source: "search_console",
      status: "attention",
      view: "runs",
    });

    expect(active).toMatchObject({
      counts: { rankChecks: 0, searchConsole: 0, total: 0 },
      runs: [],
    });
    expect(attention).toMatchObject({
      counts: { rankChecks: 0, searchConsole: 1, total: 1 },
      runs: [
        expect.objectContaining({
          attention: expect.objectContaining({ kind: "worker_unavailable" }),
          progress: { completed: 28, total: 488, unit: "days" },
        }),
      ],
    });
    expect(mocks.readActiveSearchImportSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.gscFindMany.mock.calls[0]?.[0]).toMatchObject({ take: 22 });
    expect(mocks.gscFindMany.mock.calls[1]?.[0]).toMatchObject({ take: 22 });
    expect(JSON.stringify(mocks.gscFindMany.mock.calls[1]?.[0]?.where)).toContain(
      '"id":"import_current"',
    );
  });

  it("retains equal-time rank rows after a GSC cursor and continues by rank id", async () => {
    mocks.rankFindMany.mockReset();
    mocks.rankCount.mockReset();
    mocks.gscFindMany.mockReset();
    mocks.gscCount.mockReset();
    const same = new Date("2026-09-06T12:00:00.000Z");
    const rank = rankRow({ finishedAt: same, launchedAt: same, publicId: runId });
    const nextRank = rankRow({
      finishedAt: same,
      launchedAt: same,
      publicId: "rcr_b00000000000000000000000",
    });
    const gsc = importRow({ createdAt: same, id: "import_same_time" });
    mocks.rankFindMany
      .mockResolvedValueOnce([rank, nextRank])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rank, nextRank])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([nextRank])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.gscFindMany
      .mockResolvedValueOnce([gsc])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.rankCount.mockResolvedValue(2);
    mocks.gscCount.mockResolvedValue(1);

    const first = await listProjectRuns(project, {
      cursor: null,
      limit: 1,
      source: "all",
      status: "all",
      view: "runs",
    });
    const second = await listProjectRuns(project, {
      cursor: first.nextCursor,
      limit: 1,
      source: "all",
      status: "all",
      view: "runs",
    });
    const third = await listProjectRuns(project, {
      cursor: second.nextCursor,
      limit: 1,
      source: "all",
      status: "all",
      view: "runs",
    });

    expect(first.runs.map((run) => run.id)).toEqual(["import_same_time"]);
    expect(second.runs.map((run) => run.id)).toEqual([runId]);
    expect(third.runs.map((run) => run.id)).toEqual(["rcr_b00000000000000000000000"]);
    const ids = [...first.runs, ...second.runs, ...third.runs].map((run) => run.id);
    expect(ids).toEqual(["import_same_time", runId, "rcr_b00000000000000000000000"]);
    expect(new Set(ids)).toHaveLength(ids.length);
    expect(JSON.stringify(mocks.rankFindMany.mock.calls[3]?.[0]?.where)).toContain(
      '"lte":"2026-09-06T12:00:00.000Z"',
    );
    expect(JSON.stringify(mocks.rankFindMany.mock.calls[6]?.[0]?.where)).toContain(
      '"publicId":{"gt":"rcr_a00000000000000000000000"}',
    );
  });

  it.each(["all", "attention"] as const)(
    "includes upcoming runs in %s with matching row/count predicates",
    async (status) => {
      mocks.rankFindMany.mockReset().mockResolvedValue([]);
      mocks.rankCount.mockReset().mockResolvedValue(0);
      const upcoming = rankRow({
        publicId: "rcr_c00000000000000000000000",
        status: status === "attention" ? "blocked" : "planned",
        blockedReason: status === "attention" ? "monthly_limit" : null,
        createdAt: new Date("2026-09-06T13:00:00.000Z"),
        plannedFor: new Date("2026-09-07T08:00:00.000Z"),
        finishedAt: null,
        launchedAt: null,
        startedAt: null,
        outcome: null,
        trigger: "scheduled",
      });
      mocks.rankFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([upcoming]);
      mocks.rankCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      const result = await listProjectRuns(project, {
        cursor: null,
        limit: 20,
        source: "rank_checks",
        status,
        view: "runs",
      });
      expect(result.counts).toEqual({ rankChecks: 1, searchConsole: 0, total: 1 });
      expect(result.runs.map((run) => run.id)).toEqual([upcoming.publicId]);
      const rowWhere = mocks.rankFindMany.mock.calls[2]?.[0]?.where;
      expect(rowWhere).toEqual(mocks.rankCount.mock.calls[2]?.[0]?.where);
      expect(rowWhere).toMatchObject({
        AND: [
          expect.objectContaining({
            projectId: project.id,
            launchedAt: null,
            plannedFor: { not: null },
          }),
          status === "attention" ? { status: "blocked" } : {},
        ],
      });
      expect(mocks.gscFindMany).not.toHaveBeenCalled();
    },
  );

  it("uses the same timestamp and tie-breaker for upcoming and started rows across pages", async () => {
    mocks.rankFindMany.mockReset();
    mocks.rankCount.mockReset().mockResolvedValue(1);
    const at = new Date("2026-09-06T12:00:00.000Z");
    const upcoming = rankRow({
      publicId: "rcr_b00000000000000000000000",
      status: "planned",
      createdAt: at,
      plannedFor: new Date("2026-09-07T08:00:00.000Z"),
      launchedAt: null,
      finishedAt: null,
      startedAt: null,
      outcome: null,
    });
    mocks.rankFindMany
      .mockResolvedValueOnce([rankRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([upcoming])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([upcoming]);
    const query = {
      cursor: null,
      limit: 1,
      source: "rank_checks",
      status: "all",
      view: "runs",
    } as const;
    const first = await listProjectRuns(project, query);
    const second = await listProjectRuns(project, { ...query, cursor: first.nextCursor });
    expect(first.runs.map((run) => run.id)).toEqual([runId]);
    expect(second.runs.map((run) => run.id)).toEqual([upcoming.publicId]);
    expect(second.nextCursor).toBeNull();
    expect(mocks.rankFindMany.mock.calls[5]?.[0]).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { publicId: "asc" }],
      where: {
        AND: [
          expect.anything(),
          { OR: [{ createdAt: { lt: at } }, { createdAt: at, publicId: { gt: runId } }] },
        ],
      },
    });
  });

  it.each(["active", "finished"] as const)(
    "does not query upcoming rows for %s",
    async (status) => {
      mocks.rankFindMany.mockReset().mockResolvedValue([]);
      mocks.rankCount.mockReset().mockResolvedValue(0);
      await listProjectRuns(project, {
        cursor: null,
        limit: 20,
        source: "rank_checks",
        status,
        view: "runs",
      });
      expect(mocks.rankFindMany).toHaveBeenCalledTimes(2);
      expect(mocks.rankCount).toHaveBeenCalledTimes(2);
    },
  );

  it("uses the same durable GSC status predicates for rows and counts", async () => {
    mocks.rankFindMany.mockReset();
    mocks.rankCount.mockReset();
    mocks.gscFindMany.mockReset();
    mocks.gscCount.mockReset();
    mocks.gscFindMany.mockResolvedValue([]);
    mocks.gscCount.mockResolvedValue(0);

    for (const status of ["active", "attention", "finished"] as const) {
      await listProjectRuns(project, {
        cursor: null,
        limit: 20,
        source: "search_console",
        status,
        view: "runs",
      });
    }

    const wheres = mocks.gscFindMany.mock.calls.map((call) => JSON.stringify(call[0]?.where));
    expect(wheres[0]).toContain('"rate_limited"');
    expect(wheres[1]).toContain('"needs_reauth"');
    expect(wheres[1]).not.toContain('"rate_limited"');
    expect(wheres[2]).toContain('"completed"');
    expect(wheres[2]).toContain('"failed"');
    expect(mocks.gscCount.mock.calls).toHaveLength(3);
    for (const [index, call] of mocks.gscCount.mock.calls.entries()) {
      expect(JSON.stringify(call[0]?.where)).toBe(wheres[index]);
    }
    expect(mocks.readActiveSearchImportSnapshot).toHaveBeenCalledTimes(2);
  });
});
