import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { keywordExportTarget } from "./export-target-model";

const row = (id: string) => ({ id }) as never;

describe("keywordExportTarget", () => {
  it("uses the canonical query and server count for flat filtered export", () => {
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...emptyKeywordFilters, wrongUrl: true },
      page: 2,
      pageSize: 25 as const,
    };
    const target = keywordExportTarget({
      filterChips: [{ key: "wrongUrl", label: "Wrong URL ranking" }],
      filteredRows: [row("kw_current_page")],
      flatServerQuery: query,
      matchedTargetCount: 31,
      rows: [row("kw_current_page")],
      searchValue: "",
      selectedIds: [],
    });
    expect(target).toEqual({ count: 31, selection: { mode: "query", query } });
  });

  it("keeps explicit selection ID-scoped and grouped filtering row-scoped", () => {
    const selected = keywordExportTarget({
      filterChips: [],
      filteredRows: [],
      rows: [],
      searchValue: "",
      selectedIds: ["kw_selected"],
    });
    expect(selected.selection).toEqual({ keywordIds: ["kw_selected"], mode: "selected" });
    const grouped = keywordExportTarget({
      filterChips: [{ key: "contains", label: "Contains" }],
      filteredRows: [row("kw_visible")],
      rows: [row("kw_visible"), row("kw_hidden")],
      searchValue: "",
      selectedIds: [],
    });
    expect(grouped.selection).toEqual({ keywordIds: ["kw_visible"], mode: "selected" });
  });

  it("uses query membership for lens and saved-view scopes but preserves unfiltered all", () => {
    const lensQuery = {
      ...defaultRankTrackerQueryState,
      lens: { device: "mobile" as const, locationId: "US:en" },
      savedViewId: "view_1",
    };
    const scoped = keywordExportTarget({
      filterChips: [],
      filteredRows: [row("kw_page")],
      flatServerQuery: lensQuery,
      matchedTargetCount: 40,
      rows: [row("kw_page")],
      searchValue: "",
      selectedIds: [],
    });
    expect(scoped.selection).toEqual({ mode: "query", query: lensQuery });
    const all = keywordExportTarget({
      filterChips: [],
      filteredRows: [row("kw_page")],
      flatServerQuery: {
        ...defaultRankTrackerQueryState,
        lens: { device: "all", locationId: null },
      },
      matchedTargetCount: 80,
      rows: [row("kw_page")],
      searchValue: "",
      selectedIds: [],
    });
    expect(all.selection).toEqual({ mode: "all" });
  });
});
