import { localFixtureSelection } from "@/lib/dashboard-local/test-fixtures";
import { parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import {
  keywordSavedViewConfigV2,
  keywordSavedViewV2Schema,
} from "@/lib/keywords/saved-view-v2-model";
import { keywordViewModified } from "@/lib/keywords/view-modified-state";
import { canonicalViewFixture, keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
import { describe, expect, it } from "vitest";
import { resolveKeywordPersonalView } from "./keyword-resolver";

const scope = {
  view: "local" as const,
  subject: localFixtureSelection,
  comparisonDays: 28 as const,
  asOf: "2026-10-12T12:00:00.000Z",
};
function saved() {
  const view = canonicalViewFixture();
  return {
    ...view,
    config: keywordSavedViewConfigV2({ ...keywordViewFixture(), reportScope: scope }),
  };
}
function resolve(params: Parameters<typeof parseRankTrackerQuery>[0]) {
  return resolveKeywordPersonalView({
    parsed: parseRankTrackerQuery(params),
    availableLocationIds: new Set(["krakow"]),
    availableTags: new Set(["Service"]),
    selection: { kind: "saved_view", source: "personal_default", notice: null, view: saved() },
  });
}
describe("Personal saved report scope", () => {
  it("stores immutable subject reference and time axes in the actual V2 contract", () => {
    const view = saved();
    expect(keywordSavedViewV2Schema.parse(view.config).reportScope).toEqual(scope);
    expect(resolve({}).state.reportScope).toEqual(scope);
  });
  it("explicit URL wins per axis including General/null/latest/default period", () => {
    expect(
      resolve({ reportView: "general", localSubject: "null", comparisonDays: "7", asOf: "" }),
    ).toMatchObject({
      status: "ready",
      state: { reportScope: { view: "general", subject: null, comparisonDays: 7, asOf: null } },
    });
    expect(resolve({ comparisonDays: "90" }).state.reportScope).toEqual({
      ...scope,
      comparisonDays: 90,
    });
  });
  it("an invalid explicit subject blocks instead of reviving the saved subject", () => {
    expect(resolve({ localSubject: "" })).toMatchObject({
      status: "invalid_url",
      state: { reportScope: { subject: null } },
    });
  });
  it("legacy V1 and old V2 definitions retain General and do not gain an automatic Local subject", () => {
    const { reportScope: _scope, ...oldV2 } = keywordViewFixture();
    expect(keywordSavedViewV2Schema.parse(oldV2).reportScope).toEqual({
      view: "general",
      subject: null,
      comparisonDays: 7,
      asOf: null,
    });
    const view = { ...canonicalViewFixture(), config: emptySavedViewConfig };
    const result = resolveKeywordPersonalView({
      parsed: parseRankTrackerQuery({}),
      availableLocationIds: new Set(),
      availableTags: new Set(),
      selection: { kind: "saved_view", source: "personal_default", notice: null, view },
    });
    expect(result.state.reportScope?.view).toBe("general");
    expect(keywordViewModified(saved().config, emptySavedViewConfig, false)).toBe(true);
  });
  it("scope edits mark a saved view modified while pagination remains independent", () => {
    const view = saved();
    expect(keywordViewModified(view.config, view.config, false)).toBe(false);
    expect(
      keywordViewModified(
        { ...view.config, reportScope: { ...scope, comparisonDays: 90 } },
        view.config,
        false,
      ),
    ).toBe(true);
  });
});
