import { describe, expect, it } from "vitest";
import {
  compareProjectRunsPlannedSortTuples,
  compareProjectRunsSortTuples,
  decodeProjectRunsCursor,
  encodeProjectRunsCursor,
} from "./cursor";
import { PROJECT_RUNS_DEFAULT_FILTERS } from "./filters";

const sort = {
  id: "rcr_a00000000000000000000000",
  kind: "rank_check" as const,
  sortAt: "2026-09-06T12:00:00.000Z",
};
const plannedFilters = { ...PROJECT_RUNS_DEFAULT_FILTERS, view: "planned" as const };

describe("project runs cursors", () => {
  it("keeps the existing Runs cursor bound to normalized filters", () => {
    const cursor = encodeProjectRunsCursor({ filters: PROJECT_RUNS_DEFAULT_FILTERS, sort });

    expect(decodeProjectRunsCursor(cursor, PROJECT_RUNS_DEFAULT_FILTERS)).toEqual(sort);
  });

  it("pages planned rank checks by plannedFor and stable kind/id tie-breakers", () => {
    const planned = [
      { id: "rcr_c", kind: "rank_check" as const, plannedFor: "2026-09-07T08:00:00.000Z" },
      { id: "rcr_b", kind: "rank_check" as const, plannedFor: "2026-09-07T08:00:00.000Z" },
      { id: "rcr_a", kind: "rank_check" as const, plannedFor: "2026-09-07T08:00:00.000Z" },
      { id: "rcr_next", kind: "rank_check" as const, plannedFor: "2026-09-08T08:00:00.000Z" },
    ].sort(compareProjectRunsPlannedSortTuples);
    const cursor = encodeProjectRunsCursor({ filters: plannedFilters, sort: planned[1] });

    expect(planned.map(({ id }) => id)).toEqual(["rcr_a", "rcr_b", "rcr_c", "rcr_next"]);
    expect(decodeProjectRunsCursor(cursor, plannedFilters)).toEqual(planned[1]);
    expect(
      planned
        .filter((candidate) => compareProjectRunsPlannedSortTuples(candidate, planned[1]) > 0)
        .map(({ id }) => id),
    ).toEqual(["rcr_c", "rcr_next"]);
  });

  it.each([
    { ...PROJECT_RUNS_DEFAULT_FILTERS, source: "rank_checks" as const },
    { ...PROJECT_RUNS_DEFAULT_FILTERS, status: "attention" as const },
    plannedFilters,
  ])("rejects a Runs cursor created for another filter set", (filters) => {
    const cursor = encodeProjectRunsCursor({ filters: PROJECT_RUNS_DEFAULT_FILTERS, sort });

    expect(() => decodeProjectRunsCursor(cursor, filters)).toThrow("filter set");
  });

  it("rejects a planned cursor used by Runs filters", () => {
    const cursor = encodeProjectRunsCursor({
      filters: plannedFilters,
      sort: {
        id: "rcr_a00000000000000000000000",
        kind: "rank_check",
        plannedFor: "2026-09-07T08:00:00.000Z",
      },
    });

    expect(() => decodeProjectRunsCursor(cursor, PROJECT_RUNS_DEFAULT_FILTERS)).toThrow(
      "filter set",
    );
  });

  it("rejects malformed or non-versioned federated sort tuples", () => {
    const invalidCursor = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");

    expect(() =>
      decodeProjectRunsCursor(
        invalidCursor({ filters: PROJECT_RUNS_DEFAULT_FILTERS, sort, v: 0 }),
        PROJECT_RUNS_DEFAULT_FILTERS,
      ),
    ).toThrow("valid");
    expect(() =>
      decodeProjectRunsCursor(
        invalidCursor({
          filters: PROJECT_RUNS_DEFAULT_FILTERS,
          sort: { ...sort, id: "", sortAt: "not-a-date" },
          v: 1,
        }),
        PROJECT_RUNS_DEFAULT_FILTERS,
      ),
    ).toThrow("valid");
  });

  it("sorts by newest instant, then fixed kind and id tie-breakers", () => {
    expect(
      [
        { id: "z", kind: "rank_check" as const, sortAt: "2026-09-06T12:00:00.000Z" },
        { id: "b", kind: "gsc_import" as const, sortAt: "2026-09-06T12:00:00.000Z" },
        { id: "a", kind: "gsc_import" as const, sortAt: "2026-09-06T12:00:00.000Z" },
        { id: "newest", kind: "rank_check" as const, sortAt: "2026-09-06T12:01:00.000Z" },
      ].sort(compareProjectRunsSortTuples),
    ).toEqual([
      { id: "newest", kind: "rank_check", sortAt: "2026-09-06T12:01:00.000Z" },
      { id: "a", kind: "gsc_import", sortAt: "2026-09-06T12:00:00.000Z" },
      { id: "b", kind: "gsc_import", sortAt: "2026-09-06T12:00:00.000Z" },
      { id: "z", kind: "rank_check", sortAt: "2026-09-06T12:00:00.000Z" },
    ]);
  });
});
