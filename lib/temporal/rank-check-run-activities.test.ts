import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    rankCheckRun: { findUnique: vi.fn(), updateMany: vi.fn() },
    rankCheckRunItem: { findMany: vi.fn() },
  },
  reconcileRankCheckRuns: vi.fn(),
}));

vi.mock("../rank-check/runs/reconcile", () => ({
  reconcileRankCheckRuns: mocks.reconcileRankCheckRuns,
}));
vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));

import {
  loadRankCheckRunItemsActivity,
  reconcileRankCheckRunsActivity,
} from "./rank-check-run-activities";

describe("reconcileRankCheckRunsActivity", () => {
  it("keeps a frozen sweep timestamp across activity pages", async () => {
    const sweepAt = "2026-09-02T08:00:00.000Z";
    mocks.reconcileRankCheckRuns.mockResolvedValue({
      hasMore: true,
      reconciled: 100,
      sweepAt: new Date(sweepAt),
    });

    await expect(reconcileRankCheckRunsActivity({ limit: 100, sweepAt })).resolves.toEqual({
      hasMore: true,
      reconciled: 100,
      sweepAt,
    });
    expect(mocks.reconcileRankCheckRuns).toHaveBeenCalledWith(
      { limit: 100, now: new Date(sweepAt) },
      mocks.prisma,
      expect.objectContaining({
        startRun: expect.any(Function),
        workflowExists: expect.any(Function),
      }),
    );
  });
});

describe("loadRankCheckRunItemsActivity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("loads an ordered page and resolves frozen and scheduled depth", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue({
      project: { defaults: { serpDepth: 100 } },
      projectId: "project_1",
      selectionKind: "manual_ids",
      selectionSpec: { depth: null, providerId: "provider-a" },
    });
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValue([
      {
        id: "item_1",
        keyword: { schedule: { serpDepth: 20 } },
        keywordId: "keyword_1",
        notBefore: null,
      },
      {
        id: "item_2",
        keyword: { schedule: null },
        keywordId: "keyword_2",
        notBefore: new Date("2026-09-02T08:00:00.000Z"),
      },
    ]);

    await expect(loadRankCheckRunItemsActivity({ limit: 1, runId: "run_1" })).resolves.toEqual({
      hasMore: true,
      items: [
        {
          depth: 20,
          id: "item_1",
          keywordId: "keyword_1",
          notBefore: null,
          projectId: "project_1",
          providerId: "provider-a",
          runId: "run_1",
        },
      ],
      nextCursor: { id: "item_1", notBefore: null },
    });
    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ notBefore: { nulls: "first", sort: "asc" } }, { id: "asc" }],
        take: 2,
        where: { runId: "run_1", status: "queued" },
      }),
    );
  });

  it("returns no scheduled-due items when the dispatcher owns them", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue({
      project: { defaults: { serpDepth: 100 } },
      projectId: "project_1",
      selectionKind: "scheduled_due",
      selectionSpec: { kind: "scheduled_due", v: 1 },
    });

    await expect(loadRankCheckRunItemsActivity({ runId: "run_1" })).resolves.toEqual({
      hasMore: false,
      items: [],
      nextCursor: null,
    });
    expect(mocks.prisma.rankCheckRunItem.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy", "scheduled_due"],
    ["dispatcher", "manual_ids"],
  ] as const)("keeps items for %s mode and %s runs", async (mode, selectionKind) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue({
      project: { defaults: { serpDepth: 20 } },
      projectId: "project_1",
      selectionKind,
      selectionSpec: { kind: selectionKind, v: 1 },
    });
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValue([]);

    await expect(loadRankCheckRunItemsActivity({ runId: "run_1" })).resolves.toEqual({
      hasMore: false,
      items: [],
      nextCursor: null,
    });
    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });
});
