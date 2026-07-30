import { describe, expect, it } from "vitest";
import {
  decorateSuggestions,
  filterSuggestions,
  isAllSelected,
  selectableKeys,
  selectedQueries,
  toggleKey,
  topByClicksKeys,
} from "./top-query-selection";

const suggestions = [
  { clicks: 5, impressions: 200, query: "rank tracker" },
  { clicks: 40, impressions: 900, query: "keyword tracking api" },
  { clicks: 12, impressions: 300, query: "seo dashboard" },
  { clicks: 12, impressions: 800, query: "serp api" },
];

describe("decorateSuggestions", () => {
  it("flags queries already tracked in the project case-insensitively", () => {
    const decorated = decorateSuggestions(suggestions, ["SEO Dashboard"]);

    expect(decorated.find((s) => s.query === "seo dashboard")?.alreadyTracked).toBe(true);
    expect(decorated.find((s) => s.query === "rank tracker")?.alreadyTracked).toBe(false);
  });
});

describe("topByClicksKeys", () => {
  it("picks the top N untracked suggestions by clicks, then impressions", () => {
    const decorated = decorateSuggestions(suggestions, ["keyword tracking api"]);

    // keyword tracking api is tracked and excluded; serp api beats seo dashboard on impressions.
    expect(topByClicksKeys(decorated, 2)).toEqual(["serp api", "seo dashboard"]);
  });

  it("never selects tracked rows even when N exceeds the list", () => {
    const decorated = decorateSuggestions(suggestions, ["rank tracker"]);

    expect(topByClicksKeys(decorated, 99)).not.toContain("rank tracker");
    expect(topByClicksKeys(decorated, 99)).toHaveLength(3);
  });
});

describe("isAllSelected", () => {
  it("is true only when every selectable (untracked) key is selected", () => {
    const decorated = decorateSuggestions(suggestions, ["seo dashboard"]);
    const all = new Set(selectableKeys(decorated));

    expect(isAllSelected(decorated, all)).toBe(true);
    expect(isAllSelected(decorated, new Set())).toBe(false);
    // A partial selection (e.g. after "Top N") is not "all selected".
    expect(isAllSelected(decorated, new Set(["serp api"]))).toBe(false);
  });

  it("is false when there are no selectable rows", () => {
    const decorated = decorateSuggestions([{ query: "rank tracker" }], ["rank tracker"]);

    expect(isAllSelected(decorated, new Set())).toBe(false);
  });
});

describe("filterSuggestions", () => {
  it("filters case-insensitively by substring", () => {
    const decorated = decorateSuggestions(suggestions, []);

    expect(filterSuggestions(decorated, "API").map((s) => s.query)).toEqual([
      "keyword tracking api",
      "serp api",
    ]);
    expect(filterSuggestions(decorated, "").map((s) => s.query)).toHaveLength(4);
  });
});

describe("selection helpers", () => {
  it("returns selectable keys excluding tracked rows", () => {
    const decorated = decorateSuggestions(suggestions, ["serp api"]);

    expect(selectableKeys(decorated)).toEqual([
      "rank tracker",
      "keyword tracking api",
      "seo dashboard",
    ]);
  });

  it("toggles keys immutably and resolves selected queries in source order", () => {
    const decorated = decorateSuggestions(suggestions, []);
    let selected = new Set<string>();
    selected = toggleKey(selected, "SERP API");
    selected = toggleKey(selected, "rank tracker");

    expect(selectedQueries(decorated, selected)).toEqual(["rank tracker", "serp api"]);

    selected = toggleKey(selected, "serp api");
    expect(selectedQueries(decorated, selected)).toEqual(["rank tracker"]);
  });

  it("never resolves a tracked query even if its key is in the set", () => {
    const decorated = decorateSuggestions(suggestions, ["rank tracker"]);
    const selected = new Set(["rank tracker"]);

    expect(selectedQueries(decorated, selected)).toEqual([]);
  });
});
