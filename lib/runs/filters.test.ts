import { describe, expect, it } from "vitest";
import {
  PROJECT_RUNS_DEFAULT_QUERY,
  PROJECT_RUNS_SOURCES,
  PROJECT_RUNS_STATUSES,
  PROJECT_RUNS_VIEWS,
  parseProjectRunsQuery,
  updateProjectRunsQuery,
} from "./filters";

describe("project runs query filters", () => {
  it("uses the canonical runs list defaults", () => {
    expect(parseProjectRunsQuery(new URLSearchParams())).toEqual(PROJECT_RUNS_DEFAULT_QUERY);
  });

  it.each(PROJECT_RUNS_VIEWS)("accepts the %s view", (view) => {
    expect(parseProjectRunsQuery(new URLSearchParams({ view }))).toMatchObject({ view });
  });

  it.each(PROJECT_RUNS_SOURCES)("accepts the %s source", (source) => {
    expect(parseProjectRunsQuery(new URLSearchParams({ source }))).toMatchObject({ source });
  });

  it.each(PROJECT_RUNS_STATUSES)("accepts the %s status", (status) => {
    expect(parseProjectRunsQuery(new URLSearchParams({ status }))).toMatchObject({ status });
  });

  it.each(["view=history", "source=imports", "status=queued", "limit=0", "limit=20.5"])(
    "rejects an invalid query value: %s",
    (query) => {
      expect(() => parseProjectRunsQuery(new URLSearchParams(query))).toThrow();
    },
  );

  it("clears an existing cursor when a filter changes", () => {
    const current = {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      cursor: "cursor_from_the_previous_filter_set",
    };

    expect(updateProjectRunsQuery(current, { source: "rank_checks" })).toEqual({
      ...current,
      cursor: null,
      source: "rank_checks",
    });
  });

  it("keeps a cursor when non-filter pagination changes", () => {
    const current = {
      ...PROJECT_RUNS_DEFAULT_QUERY,
      cursor: "cursor_from_the_same_filter_set",
    };

    expect(updateProjectRunsQuery(current, { limit: 50 })).toEqual({ ...current, limit: 50 });
  });
});
