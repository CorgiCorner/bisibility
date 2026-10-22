import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { describe, expect, it } from "vitest";
import { defaultRankTrackerQueryState } from "./rank-tracker-query";
import { keywordSavedViewConfigV2, keywordViewLegacyScope } from "./saved-view-v2-model";
import { keywordViewModified } from "./view-modified-state";

const defaults = defaultRankTrackerQueryState;
function config() {
  return keywordSavedViewConfigV2({
    filters: defaults.filters,
    lens: defaults.lens,
    search: defaults.search,
    pageSize: defaults.pageSize,
    sort: defaults.sort,
    grouped: defaults.grouped,
    presentation: emptyTablePresentation,
  });
}
describe("saved keyword view modified state", () => {
  it("does not mark a legacy view changed merely because its presentation schema is upgraded", () => {
    const current = config();
    expect(keywordViewModified(current, keywordViewLegacyScope(current), false)).toBe(false);
    expect(
      keywordViewModified(
        { ...current, search: "dentysta" },
        keywordViewLegacyScope(current),
        false,
      ),
    ).toBe(true);
  });
  it("does not mark automatic grouping in a multi-market view as a user edit", () => {
    const current = config();
    expect(keywordViewModified({ ...current, grouped: !current.grouped }, current, false)).toBe(
      false,
    );
    expect(keywordViewModified({ ...current, grouped: !current.grouped }, null, false)).toBe(false);
  });
  it("marks unsaved General layout and concrete market changes", () => {
    const current = config();
    expect(keywordViewModified(current, null, true)).toBe(true);
    expect(
      keywordViewModified(
        { ...current, lens: { device: "mobile", locationId: "location-a" } },
        null,
        false,
      ),
    ).toBe(true);
  });
  it("compares the actual v2 presentation and sort rather than a page's rows", () => {
    const saved = config();
    expect(
      keywordViewModified(
        { ...saved, presentation: { ...saved.presentation, visibility: { volume: false } } },
        saved,
        true,
      ),
    ).toBe(true);
    expect(
      keywordViewModified(
        { ...saved, sort: { field: "position", direction: "asc" } },
        saved,
        false,
      ),
    ).toBe(true);
  });
});
