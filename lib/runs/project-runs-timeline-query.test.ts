import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_RUNS_DEFAULT_QUERY } from "./filters";
import { listProjectRunsTimeline } from "./project-runs-timeline-query";

const mocks = vi.hoisted(() => ({ raw: vi.fn(), ranks: vi.fn(), markets: vi.fn(), ai: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.raw,
    rankCheckRun: { findMany: mocks.ranks },
    aiTrackingRun: { findMany: mocks.ai },
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
  it("hydrates AI from the same selected page and retains full server counts", async () => {
    mocks.ai.mockResolvedValue([
      {
        id: "internal_ai",
        publicId: "air_abcdefghijklmnopqrstuvwx",
        state: "partial",
        createdAt: at,
        plannedAt: null,
        finishedAt: at,
        launchPayload: {},
      },
    ]);
    mocks.raw
      .mockResolvedValueOnce([
        {
          id: "internal_ai",
          publicId: "air_abcdefghijklmnopqrstuvwx",
          kind: "ai",
          group: 2,
          sortAt: at,
        },
      ])
      .mockResolvedValueOnce([{ kind: "ai", total: 123n }])
      .mockResolvedValueOnce([
        {
          runId: "internal_ai",
          total: 12,
          completed: 12,
          known: 11,
          costCents: "1.0001",
          startedAt: at,
        },
      ]);
    const result = await listProjectRunsTimeline(project.id, project, {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      source: "ai_tracking",
      status: "attention",
    });
    expect(result.counts).toEqual({ aiTracking: 123, rankChecks: 0, searchConsole: 0, total: 123 });
    expect(result.runs[0]).toMatchObject({
      kind: "ai",
      cost: { actualCents: 1.0001, state: "partial" },
      progress: { completed: 12, total: 12, unit: "samples" },
    });
    expect(mocks.ai).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: project.id, id: { in: ["internal_ai"] } } }),
    );
    expect(mocks.ranks).not.toHaveBeenCalled();
  });
  it("shows current runnable schedule members only for unlaunched occurrences", async () => {
    const ranks = [
      row(1, "planned"),
      { ...row(3, "queued"), plannedFor: new Date("2026-10-01T00:00:00Z") },
      row(2, "completed"),
    ];
    mocks.ranks.mockResolvedValue(ranks);
    mocks.raw
      .mockResolvedValueOnce(
        ranks.map((run, index) => ({
          id: run.id,
          publicId: run.publicId,
          kind: "rank",
          group: index < 2 ? 1 : 2,
          sortAt: at,
        })),
      )
      .mockResolvedValueOnce([{ kind: "rank", total: 3n }]);
    const page = await listProjectRunsTimeline(project.id, project, {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      source: "rank_checks",
    });
    expect(page.runs.map((run) => run.scope)).toEqual([
      { kind: "rank", description: null, keywordCount: 1 },
      { kind: "rank", description: null, keywordCount: 1 },
      { kind: "rank", description: null, keywordCount: 7 },
    ]);
    // Waiting projections must use the SQL cursor instant, including queued retries.
    expect(page.runs[1].timestamps).toMatchObject({ nextCheckAt: at.toISOString() });
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
          kind: "rank",
          group: 2,
          sortAt: at,
        },
      ])
      .mockResolvedValueOnce([{ kind: "rank", total: 1n }]);
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

it.each([
  ["all", "all"],
  ["rank_checks", "all"],
  ["all", "cancelled"],
  ["rank_checks", "cancelled"],
] as const)("loads legacy cancellation in %s/%s timeline history", async (source, status) => {
  const legacy = { ...row(4, "completed"), outcome: "cancelled", costCents: 7 };
  mocks.ranks.mockResolvedValue([legacy]);
  mocks.raw
    .mockResolvedValueOnce([
      { id: legacy.id, publicId: legacy.publicId, kind: "rank", group: 2, sortAt: at },
    ])
    .mockResolvedValueOnce([{ kind: "rank", total: 1n }]);
  const result = await listProjectRunsTimeline(project.id, project, {
    ...PROJECT_RUNS_DEFAULT_QUERY,
    source,
    status,
    section: "history",
  });
  expect(result.runs).toHaveLength(1);
  expect(result.runs[0]).toMatchObject({
    id: legacy.publicId,
    lifecycle: "cancelled",
    details: { status: "cancelled", outcome: null, costCents: 7 },
    scope: { keywordCount: 7 },
  });
});
