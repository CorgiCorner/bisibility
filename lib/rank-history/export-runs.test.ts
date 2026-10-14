import { decodeUnprefixedCursor } from "@/lib/api/pagination";
import { reportAsOf } from "@/lib/rank-reports/report-test-fixture";
import { describe, expect, it, vi } from "vitest";
import { loadHistoryExportRuns } from "./export-runs";
import { retainedRunFixture, retainedRunItemFixture } from "./export-runs-test-fixture";

vi.mock("server-only", () => ({}));
function database(items = [retainedRunItemFixture()], runs = [retainedRunFixture()]) {
  return {
    rankCheckRun: { count: vi.fn(async () => runs.length), findMany: vi.fn(async () => runs) },
    rankCheckRunItem: {
      count: vi.fn(async () => items.length),
      findMany: vi.fn(async () => items),
    },
  };
}
const input = {
  projectId: "project-db",
  keywordIds: ["keyword-db"],
  asOf: reportAsOf,
  fullProject: true,
  capacity: 20,
};
describe("retained no-check run export authority", () => {
  it("reads a 601-run retained source in bounded 500-row batches without truncation", async () => {
    const runs = Array.from({ length: 601 }, (_, index) =>
      retainedRunFixture({
        id: `run-db-${String(index).padStart(4, "0")}`,
        publicId: `rcr_a${String(index).padStart(23, "0")}`,
      }),
    );
    const items = runs.map((run, index) =>
      retainedRunItemFixture({
        id: `item-db-${String(index).padStart(4, "0")}`,
        runId: run.id,
        keywordId: `keyword-db-${index}`,
        keyword: { publicId: `kw_a${String(index).padStart(23, "0")}` },
        run: {
          publicId: run.publicId,
          status: run.status,
          outcome: run.outcome,
          updatedAt: run.updatedAt,
        },
      }),
    );
    type Port = Parameters<typeof loadHistoryExportRuns>[0];
    const readItems = vi.fn<Port["rankCheckRunItem"]["findMany"]>(async (query) => {
      const start = query.cursor ? items.findIndex((row) => row.id === query.cursor?.id) + 1 : 0;
      return items.slice(start, start + query.take);
    });
    const readRuns = vi.fn<Port["rankCheckRun"]["findMany"]>(async (query) => {
      const start = query.cursor
        ? runs.findIndex((row) => row.publicId === query.cursor?.publicId) + 1
        : 0;
      return runs.slice(start, start + query.take);
    });
    const db = {
      rankCheckRun: { count: async () => runs.length, findMany: readRuns },
      rankCheckRunItem: { count: async () => items.length, findMany: readItems },
    };
    const result = await loadHistoryExportRuns(db, {
      ...input,
      keywordIds: items.map((row) => row.keywordId),
      capacity: 1300,
    });
    expect(result.records).toHaveLength(1202);
    expect(new Set(result.records.map((row) => row.id)).size).toBe(1202);
    for (const read of [readItems, readRuns]) {
      expect(read).toHaveBeenCalledTimes(2);
      for (const [query] of read.mock.calls) expect(query.take).toBe(500);
    }
  });
  it("projects cancelled/deferred/blocked original items and runs without fake measurements", async () => {
    for (const status of ["cancelled", "deferred", "blocked"]) {
      const db = database(
        [retainedRunItemFixture({ status })],
        [
          retainedRunFixture({
            status: status === "deferred" ? "completed" : status,
            outcome: status === "deferred" ? "deferred" : null,
          }),
        ],
      );
      const result = await loadHistoryExportRuns(db, input);
      expect(result.records).toHaveLength(2);
      const item = result.records.find((row) => row.kind === "rank_check_run_item");
      expect(item).toMatchObject({
        kind: "rank_check_run_item",
        runId: "rcr_abcdefghijklmnopqrstuvwx",
        keywordId: "kw_abcdefghijklmnopqrstuvwx",
        status,
        rankCheckState: "not_attached",
      });
      expect(decodeUnprefixedCursor(item?.id ?? null)).toMatchObject({
        public_id: "run-item-db",
        t: "2026-10-12T11:30:00.000Z",
      });
      for (const row of result.records)
        for (const field of [
          "checkId",
          "position",
          "observedAt",
          "checkedAt",
          "provider",
          "costCents",
        ])
          expect(row).not.toHaveProperty(field);
      expect(db.rankCheckRunItem.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          rankCheckId: null,
          keyword: { projectId: input.projectId },
          run: expect.objectContaining({ projectId: input.projectId, deletedAt: null }),
        }),
      });
    }
  });
  it("retains empty project-only runs but reports unknown membership for selected scope", async () => {
    const db = database([], [retainedRunFixture({ _count: { items: 0 }, totalCount: 0 })]);
    const full = await loadHistoryExportRuns(db, input);
    expect(full.records).toMatchObject([
      { kind: "rank_check_run", scopeMembership: "project_only" },
    ]);
    const selected = await loadHistoryExportRuns(db, { ...input, fullProject: false });
    expect(selected.records).toEqual([]);
    expect(selected.unresolvedMembershipCount).toBe(1);
  });
  it("does not widen a selected cohort to other persisted run items", async () => {
    const other = retainedRunItemFixture({
      id: "other-item",
      keywordId: "other-keyword",
      keyword: { publicId: "kw_bbcdefghijklmnopqrstuvwx" },
    });
    const result = await loadHistoryExportRuns(
      database([retainedRunItemFixture(), other], [retainedRunFixture({ _count: { items: 2 } })]),
      { ...input, fullProject: false },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      kind: "rank_check_run_item",
      keywordId: "kw_abcdefghijklmnopqrstuvwx",
    });
  });
  it("refuses post-asOf mutation, missing captured items and partial capacity before reading payloads", async () => {
    const later = new Date(reportAsOf.getTime() + 1);
    for (const db of [
      database([retainedRunItemFixture({ updatedAt: later })]),
      database([], [retainedRunFixture()]),
    ])
      await expect(loadHistoryExportRuns(db, input)).rejects.toMatchObject({ status: 409 });
    const db = database();
    await expect(loadHistoryExportRuns(db, { ...input, capacity: 1 })).rejects.toMatchObject({
      status: 413,
    });
    expect(db.rankCheckRunItem.findMany).not.toHaveBeenCalled();
    expect(db.rankCheckRun.findMany).not.toHaveBeenCalled();
  });
});
