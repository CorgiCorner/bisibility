import { normalizeOverviewFilters } from "@/lib/queries/overview-filters";
import { expect, it } from "vitest";
import { comparisonConfig, comparisonSelection } from "./fixture";
import { resolveDashboardComparisonScope } from "./scope";
import { effectiveDashboardComparisonSelection } from "./selection";

it("gives an explicit revisioned URL precedence over the remembered reference", () => {
  expect(
    effectiveDashboardComparisonSelection(
      JSON.stringify({ ...comparisonSelection, revision: 4 }),
      comparisonSelection,
    ),
  ).toEqual({ state: "selected", selection: { ...comparisonSelection, revision: 4 } });
  expect(effectiveDashboardComparisonSelection(undefined, comparisonSelection)).toEqual({
    state: "selected",
    selection: comparisonSelection,
  });
  expect(effectiveDashboardComparisonSelection("", comparisonSelection)).toEqual({
    state: "missing",
  });
});
it.each([
  "{}",
  "not-json",
  JSON.stringify({ ...comparisonSelection, revision: 0 }),
  JSON.stringify({ ...comparisonSelection, actor: "owner" }),
  [JSON.stringify(comparisonSelection)],
  "x".repeat(513),
])("does not widen an invalid link or guess a revision: %j", (value) => {
  expect(effectiveDashboardComparisonSelection(value, comparisonSelection)).toEqual({
    state: "invalid",
  });
});
it("binds the existing comparison axes and preserves the selected range and tag", () => {
  expect(
    resolveDashboardComparisonScope(
      comparisonConfig(),
      normalizeOverviewFilters({ range: "90d", tag: "core" }),
      { tag: "core" },
    ),
  ).toEqual({ range: "90d", device: "mobile", marketIds: ["loc"], tag: "core" });
});
it.each([
  { device: "all" },
  { device: "desktop" },
  { device: ["mobile"] },
  { market: "loc,other" },
  { market: ["loc", "loc"] },
  { market: "other" },
  { tag: ["core"] },
])("refuses conflicting/ambiguous axes without broadening %j", (explicit) => {
  expect(
    resolveDashboardComparisonScope(comparisonConfig(), normalizeOverviewFilters(), explicit),
  ).toBeNull();
});
it("does not replace an immutable saved tag with an explicit conflicting one", () => {
  const config = comparisonConfig();
  config.filters.tag = "saved";
  expect(
    resolveDashboardComparisonScope(config, normalizeOverviewFilters({ tag: "other" }), {
      tag: "other",
    }),
  ).toBeNull();
  expect(resolveDashboardComparisonScope(config, normalizeOverviewFilters(), {})?.tag).toBe(
    "saved",
  );
});
