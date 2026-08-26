import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { describe, expect, it } from "vitest";
import {
  filterFieldsForChip,
  rankTrackerMutationPresence,
  rankTrackerNavigationHref,
  rankTrackerSortFromGrid,
  resetRankTrackerPage,
} from "./rank-tracker-navigation";
import { parseRankTrackerQuery, resolveRankTrackerQuery } from "./rank-tracker-query";

const query = {
  filters: { ...emptyKeywordFilters, tags: [] },
  grouped: false,
  lens: { device: "desktop" as const, locationId: null },
  page: 4,
  pageSize: 25 as const,
  savedViewId: "viw_1",
  search: "",
  sort: { direction: "asc" as const, field: "position" as const },
};

describe("rankTrackerNavigationHref", () => {
  it("preserves orthogonal params and explicit query semantics", () => {
    const href = rankTrackerNavigationHref({
      basePath: "/app/prj_1/rank-tracker",
      current: new URLSearchParams("tab=tracked&add=1&action=filter&tags=&grouped=0"),
      present: ["tags", "grouped"],
      query,
    });
    expect(href).toContain("view=viw_1");
    expect(href).toContain("tags=");
    expect(href).toContain("grouped=0");
    expect(href).toContain("add=1");
    expect(href).toContain("action=filter");
  });

  it("resets only page when query controls change", () => {
    expect(resetRankTrackerPage(query)).toEqual({ ...query, page: 1 });
  });

  it("keeps explicit empty saved-view overrides through later controls", () => {
    const savedView = {
      filters: { ...emptyKeywordFilters, tags: ["saved"], wrongUrl: true },
      lens: { device: "mobile" as const, locationId: "US" },
      search: "saved search",
      surface: "keywords" as const,
      version: 1 as const,
    };
    let current = new URLSearchParams("view=viw_1&wrongUrl=0&tags=&q=");
    const controls = [
      { next: { ...query, savedViewId: "viw_1", page: 2 }, forced: ["page"] as const },
      {
        next: { ...query, savedViewId: "viw_1", filters: { ...query.filters, tags: [] } },
        forced: ["tags", "page"] as const,
      },
      {
        next: {
          ...query,
          savedViewId: "viw_1",
          lens: { device: "all" as const, locationId: null },
        },
        forced: ["device", "location", "page"] as const,
      },
      {
        next: { ...query, savedViewId: "viw_1", grouped: true },
        forced: ["grouped", "page"] as const,
      },
    ];
    for (const control of controls) {
      const resolved = resolveRankTrackerQuery(
        parseRankTrackerQuery(Object.fromEntries(current)),
        savedView,
      );
      const next = { ...control.next, filters: resolved.filters, search: resolved.search };
      const href = rankTrackerNavigationHref({
        basePath: "/app/prj_1/rank-tracker",
        current,
        present: rankTrackerMutationPresence(resolved, next, control.forced),
        query: next,
      });
      current = new URL(href, "https://example.com").searchParams;
      const reparsed = resolveRankTrackerQuery(
        parseRankTrackerQuery(Object.fromEntries(current)),
        savedView,
      );
      expect(reparsed.filters.wrongUrl).toBe(false);
      expect(reparsed.filters.tags).toEqual([]);
      expect(reparsed.search).toBe("");
    }
  });

  it("marks newly cleared inherited values before subsequent navigation", () => {
    const current = {
      ...query,
      filters: { ...query.filters, tags: ["saved"], wrongUrl: true },
      search: "saved",
    };
    const cleared = { ...current, filters: { ...emptyKeywordFilters }, page: 1, search: "" };
    expect(rankTrackerMutationPresence(current, cleared)).toEqual(
      expect.arrayContaining(["tags", "wrongUrl", "search", "page"]),
    );
    expect(filterFieldsForChip("tag:saved")).toEqual(["tags"]);
    expect(filterFieldsForChip("volume")).toEqual(["volMin", "volMax"]);
  });

  it.each([
    undefined,
    {},
    { field: "actions", sort: "desc" },
    { field: "__check__", sort: "asc" },
    { field: "unsupported", sort: "desc" },
  ])("maps empty or invalid grid sort %j to the default", (sort) => {
    expect(rankTrackerSortFromGrid(sort)).toEqual({ direction: "asc", field: "position" });
  });

  it.each([
    "keyword",
    "device",
    "position",
    "change",
    "volume",
    "difficulty",
    "sparkline",
    "clicks",
    "impressions",
    "ctr",
    "lastChecked",
    "frequency",
    "location",
    "targetRanking",
    "tags",
    "topic",
    "intent",
  ])("accepts visible sortable field %s", (field) => {
    expect(rankTrackerSortFromGrid({ field, sort: "desc" })).toEqual({ direction: "desc", field });
  });
});
