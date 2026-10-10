import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_RUNS_DEFAULT_QUERY } from "./filters";
import { listProjectRunsTimeline } from "./project-runs-timeline-query";

const mocks = vi.hoisted(() => ({ raw: vi.fn(), ranks: vi.fn(), markets: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.raw,
    rankCheckRun: { findMany: mocks.ranks },
    projectMarket: { findMany: mocks.markets },
  },
}));
vi.mock("@/lib/search-insights/sync/operation-snapshot", () => ({
  readActiveSearchImportSnapshot: vi.fn().mockResolvedValue(null),
}));
const project = { id: "project", name: "Example", publicId: "prj_abcdefghijklmnopqrstuvwx" };
const at = new Date("2026-10-07T08:00:00Z");

function row(index: number, status: string) {
  return {
    id: `run_${index}`,
    publicId: `rcr_a${String(index).padStart(23, "0")}`,
    blockedReason: null,
    completedCount: 0,
    costCents: 0,
    estimatedCostCents: 0,
    createdAt: at,
    finishedAt: status === "completed" ? at : null,
    keywordCount: status === "completed" ? 7 : 0,
    launchedAt: status === "completed" ? at : null,
    outcome: status === "completed" ? "succeeded" : null,
    plannedFor: at,
    startedAt: status === "completed" ? at : null,
    status,
    targetCount: 0,
    totalCount: 0,
    trigger: "scheduled",
    checkSchedule: {
      keywords: [
        { id: "active", archivedAt: null, locationId: "active" },
        { id: "archived", archivedAt: at, locationId: "active" },
        { id: "paused", archivedAt: null, locationId: "paused" },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markets.mockResolvedValue([{ locationId: "active" }]);
});

describe("timeline scope projection", () => {
  it("shows current runnable schedule members only for unlaunched occurrences", async () => {
    const ranks = [row(1, "planned"), row(3, "queued"), row(2, "completed")];
    mocks.ranks.mockResolvedValue(ranks);
    mocks.raw
      .mockResolvedValueOnce(
        ranks.map((run, index) => ({
          id: run.id,
          publicId: run.publicId,
          kind: "rank_check",
          group: index < 2 ? 1 : 2,
          sortAt: at,
        })),
      )
      .mockResolvedValueOnce([{ kind: "rank_check", total: 3n }]);
    const page = await listProjectRunsTimeline(project.id, project, {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      source: "rank_checks",
    });
    expect(page.runs.map((run) => run.scope)).toEqual([
      { kind: "rank_check", description: null, keywordCount: 1 },
      { kind: "rank_check", description: null, keywordCount: 1 },
      { kind: "rank_check", description: null, keywordCount: 7 },
    ]);
    expect(page.counts.total).toBe(3);
    expect(mocks.ranks).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["run_1", "run_3", "run_2"] }, projectId: project.id, deletedAt: null },
      }),
    );
  });

  it("preserves historical scope after all current members have been deleted", async () => {
    const completed = { ...row(2, "completed"), checkSchedule: { keywords: [] } };
    mocks.ranks.mockResolvedValue([completed]);
    mocks.raw
      .mockResolvedValueOnce([
        {
          id: completed.id,
          publicId: completed.publicId,
          kind: "rank_check",
          group: 2,
          sortAt: at,
        },
      ])
      .mockResolvedValueOnce([{ kind: "rank_check", total: 1n }]);
    const page = await listProjectRunsTimeline(project.id, project, {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      source: "rank_checks",
    });
    expect(page.runs[0].scope).toMatchObject({ keywordCount: 7 });
    expect(page.runs[0].details).toMatchObject({
      status: "completed",
      outcome: "succeeded",
      blockedReason: null,
    });
  });
});
