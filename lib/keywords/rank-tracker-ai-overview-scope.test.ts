import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import {
  parseRankTrackerQuery,
  serializeRankTrackerQuery,
} from "@/lib/keywords/rank-tracker-query";
import {
  keywordSavedViewConfigV2,
  keywordSavedViewV2Schema,
} from "@/lib/keywords/saved-view-v2-model";
import { resolveKeywordPersonalView } from "@/lib/project-surface-preferences/keyword-resolver";
import { canonicalViewFixture, keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
import { describe, expect, it } from "vitest";

describe("AI Overviews saved report scope", () => {
  it("round-trips the scope and both filters, and still loads a view saved before the filter existed", () => {
    const scope = {
      view: "ai_overviews" as const,
      subject: null,
      comparisonDays: 7 as const,
      asOf: null,
    };
    const config = keywordSavedViewConfigV2({
      ...keywordViewFixture(),
      filters: { ...emptyKeywordFilters, aiOverviewShown: true, wrongUrl: true },
      reportScope: scope,
    });
    const parsed = keywordSavedViewV2Schema.parse(JSON.parse(JSON.stringify(config)));
    expect(parsed.reportScope).toEqual(scope);
    expect(parsed.filters.aiOverviewShown).toBe(true);
    expect(parsed.filters.wrongUrl).toBe(true);
    const reloaded = resolveKeywordPersonalView({
      parsed: parseRankTrackerQuery({}),
      availableLocationIds: new Set(["krakow"]),
      availableTags: new Set(["Service"]),
      selection: {
        kind: "saved_view",
        source: "personal_default",
        notice: null,
        view: { ...canonicalViewFixture(), config: parsed },
      },
    });
    expect(reloaded.status).toBe("ready");
    expect(reloaded.state.reportScope).toEqual(scope);
    expect(reloaded.state.filters.aiOverviewShown).toBe(true);
    expect(reloaded.state.filters.wrongUrl).toBe(true);
    const query = parseRankTrackerQuery({
      reportView: "ai_overviews",
      aiOverviewShown: "1",
      wrongUrl: "1",
    });
    expect(query.issues).toEqual([]);
    expect(serializeRankTrackerQuery(query).get("reportView")).toBe("ai_overviews");
    expect(serializeRankTrackerQuery(query).get("aiOverviewShown")).toBe("1");
    const { aiOverviewShown: _shown, ...legacyFilters } = keywordViewFixture().filters;
    expect(
      keywordSavedViewV2Schema.parse({ ...keywordViewFixture(), filters: legacyFilters }).filters
        .aiOverviewShown,
    ).toBe(false);
  });
});
