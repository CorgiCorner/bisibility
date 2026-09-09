import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  lockRunSelectionKeywords,
  resolveRunSelection,
  runSelectionKeywordInProgress,
  runSelectionKeywordSelect,
  runSelectionSpecSchema,
} from "./selection";

const PROJECT = { domain: "example.com", id: "project_1" };
const KW_A = "kw_abcdefghijklmnopqrstuvwx";
const KW_B = "kw_bcdefghijklmnopqrstuvwxy";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  resolveExportIds: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { keyword: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({
  keywordIdsWhere: (projectId: string, keywordIds: string[]) => ({
    projectId,
    publicId: { in: keywordIds },
  }),
}));
vi.mock("@/lib/queries/rank-tracker-selection-core", () => ({
  resolveRankTrackerExportKeywordIdsForProject: mocks.resolveExportIds,
}));

const flatQuery: RankTrackerQueryState = {
  filters: {
    change: "any",
    contains: "",
    intents: [],
    lastCheck: "any",
    position: [],
    serp: [],
    tags: [],
    topics: [],
    urlChanged: false,
    volMax: 50,
    volMin: 0,
    wrongUrl: false,
  },
  grouped: false,
  lens: { device: "all", locationId: null },
  page: 1,
  pageSize: 25,
  savedViewId: null,
  search: "",
  sort: { direction: "asc", field: "keyword" },
};

describe("run selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only client selection kinds and unique bounded public IDs", () => {
    expect(runSelectionSpecSchema.parse({ kind: "single", keywordId: KW_A, v: 1 })).toEqual({
      kind: "single",
      keywordId: KW_A,
      v: 1,
    });
    expect(
      runSelectionSpecSchema.safeParse({ kind: "selected", keywordIds: [KW_A, KW_A], v: 1 })
        .success,
    ).toBe(false);
    expect(runSelectionSpecSchema.safeParse({ kind: "scheduled_due", v: 1 }).success).toBe(false);
  });

  it("produces an order-independent hash that changes with membership", async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ id: "internal_b" }, { id: "internal_a" }])
      .mockResolvedValueOnce([{ id: "internal_a" }, { id: "internal_b" }])
      .mockResolvedValueOnce([{ id: "internal_a" }, { id: "internal_c" }]);

    const first = await resolveRunSelection(PROJECT, { kind: "all", v: 1 });
    const second = await resolveRunSelection(PROJECT, { kind: "all", v: 1 });
    const changed = await resolveRunSelection(PROJECT, { kind: "all", v: 1 });

    expect(first.keywordIds).toEqual(["internal_a", "internal_b"]);
    expect(first.selectionHash).toBe(second.selectionHash);
    expect(first.selectionHash).not.toBe(changed.selectionHash);
  });

  it("uses project-scoped public ID lookup for selected keywords", async () => {
    mocks.findMany.mockResolvedValue([{ id: "internal_a" }]);

    await expect(
      resolveRunSelection(PROJECT, { kind: "selected", keywordIds: [KW_A, KW_B], v: 1 }),
    ).resolves.toMatchObject({ keywordIds: ["internal_a"] });
    expect(mocks.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { projectId: "project_1", publicId: { in: [KW_A, KW_B] } },
    });
  });

  it("reuses the export resolver for flat filter semantics", async () => {
    const query = { grouped: true } as never;
    mocks.resolveExportIds.mockRejectedValue(
      new Error("Rank tracker list query supports flat mode only."),
    );

    await expect(resolveRunSelection(PROJECT, { kind: "filter", query, v: 1 })).rejects.toThrow(
      "Rank tracker list query supports flat mode only.",
    );
  });

  it("removes the export membership cap for run filters", async () => {
    mocks.resolveExportIds.mockResolvedValue([KW_B, KW_A]);
    mocks.findMany.mockResolvedValue([{ id: "internal_z" }, { id: "internal_a" }]);

    await expect(
      resolveRunSelection(PROJECT, { kind: "filter", query: flatQuery, v: 1 }),
    ).resolves.toMatchObject({ keywordIds: ["internal_a", "internal_z"] });
    expect(mocks.resolveExportIds).toHaveBeenCalledWith(PROJECT, flatQuery, {
      membershipLimit: null,
    });
  });

  it("locks selected keyword rows before reading active work", async () => {
    const queryRaw = vi.fn(async (_query: unknown) => []);
    const findMany = vi.fn(async () => []);

    await lockRunSelectionKeywords(
      { $queryRaw: queryRaw, keyword: { findMany } } as never,
      "project_1",
      ["keyword_1", "keyword_2"],
    );

    const lock = queryRaw.mock.calls[0]?.[0] as unknown as { sql: string; values: unknown[] };
    expect(lock.sql.replace(/\s+/g, " ")).toContain("ORDER BY k.id FOR UPDATE OF k");
    expect(lock.values).toEqual(["project_1", "keyword_1", "keyword_2"]);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0]);
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: runSelectionKeywordSelect,
      where: { id: { in: ["keyword_1", "keyword_2"] }, projectId: "project_1" },
    });
  });

  it("treats a queued active run item as in progress", () => {
    expect(
      runSelectionKeywordInProgress({
        archivedAt: null,
        id: "keyword_1",
        locationId: "location_1",
        queuedRankCheckTasks: [],
        rankCheckRunItems: [{ status: "queued" }],
        rankChecks: [{ status: "completed" }],
        checkSchedule: null,
        schedule: null,
        text: "one",
      }),
    ).toBe(true);
  });
});
