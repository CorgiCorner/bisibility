import { requirePublicId } from "@/lib/db/public-id";
import { parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import {
  canonicalViewFixture,
  keywordViewFixture,
  viewProjectId,
} from "@/lib/saved-views/view-test-fixture";
import { describe, expect, it } from "vitest";
import { resolveCompetitorPersonalView } from "./competitor-resolver";
import { resolveKeywordPersonalView } from "./keyword-resolver";
import { generalPreference, setPersonalDefaultSchema } from "./model";
import { resolvePersonalViewSelection } from "./selection-resolver";

const view = canonicalViewFixture();
function selection(explicitViewPresent = false, explicitViewId: string | null = null) {
  return resolvePersonalViewSelection({
    explicitViewId,
    explicitViewPresent,
    preference: {
      ...generalPreference(viewProjectId, "keywords"),
      defaultTarget: { kind: "saved_view", viewId: requirePublicId(view.id, "viw") },
    },
    projectId: viewProjectId,
    surface: "keywords",
    views: [view],
  });
}
describe("URL, personal default and General precedence", () => {
  it("allows explicit empty and false to remove default constraints, without mutating parsed input", () => {
    const parsed = parseRankTrackerQuery({
      tags: "",
      location: "",
      wrongUrl: "0",
      grouped: "0",
      q: "",
      pageSize: "25",
      sort: "keyword",
      dir: "asc",
      page: "3",
    });
    const before = structuredClone(parsed.state);
    const result = resolveKeywordPersonalView({
      availableLocationIds: new Set(),
      availableTags: new Set(),
      parsed,
      selection: selection(),
    });
    expect(result.status).toBe("ready");
    expect(result.state).toMatchObject({
      filters: { tags: [], wrongUrl: false },
      grouped: false,
      lens: { device: "mobile", locationId: null },
      page: 3,
      pageSize: 25,
      search: "",
      sort: { direction: "asc", field: "keyword" },
    });
    expect(parsed.state).toEqual(before);
  });
  it("explicit empty view picks General, missing explicit view blocks, and missing personal default is neutral", () => {
    expect(selection(true, null)).toEqual({ kind: "general", notice: null });
    expect(selection(true, "viw_missing")).toEqual({
      kind: "unavailable_explicit_view",
      notice: null,
    });
    expect(
      resolvePersonalViewSelection({
        explicitViewId: null,
        explicitViewPresent: false,
        preference: {
          ...generalPreference(viewProjectId, "keywords"),
          defaultTarget: { kind: "saved_view", viewId: requirePublicId(view.id, "viw") },
        },
        projectId: viewProjectId,
        surface: "keywords",
        views: [],
      }),
    ).toEqual({ kind: "general", notice: "unavailable_default" });
    expect(
      resolvePersonalViewSelection({
        explicitViewId: view.id,
        explicitViewPresent: true,
        projectId: "other",
        surface: "keywords",
        views: [view],
      }),
    ).toEqual({ kind: "unavailable_explicit_view", notice: null });
  });
  it("retains missing geo and tag constraints in a blocked state instead of widening", () => {
    const result = resolveKeywordPersonalView({
      availableLocationIds: new Set(),
      availableTags: new Set(),
      parsed: parseRankTrackerQuery({}),
      selection: selection(),
    });
    expect(result).toMatchObject({
      missingScope: ["location", "tags"],
      state: { filters: { tags: ["Service"] }, lens: { locationId: "krakow" } },
      status: "unavailable_scope",
    });
  });
  it("uses a personal layout on the default route while an explicit view link restores its definition", () => {
    const personalPresentation = {
      ...keywordViewFixture().presentation,
      visibility: { volume: false },
    };
    const input = {
      availableLocationIds: new Set(["krakow"]),
      availableTags: new Set(["Service"]),
      parsed: parseRankTrackerQuery({}),
      personalPresentation,
    };
    expect(resolveKeywordPersonalView({ ...input, selection: selection() }).presentation).toEqual(
      personalPresentation,
    );
    expect(
      resolveKeywordPersonalView({ ...input, selection: selection(true, view.id) }).presentation,
    ).toEqual(view.config.version === 2 ? view.config.presentation : null);
  });
  it("does not query a broadened fallback after malformed nonempty URL scope", () => {
    const parsed = parseRankTrackerQuery({ location: "x".repeat(121) });
    expect(parsed.issues).toContain("location");
    expect(
      resolveKeywordPersonalView({
        availableLocationIds: new Set(["krakow"]),
        availableTags: new Set(["Service"]),
        parsed,
        selection: selection(),
      }).status,
    ).toBe("invalid_url");
  });
  it("requires an explicit competitor scope for General and keeps removed scopes unavailable", () => {
    const input = {
      availableMarketKeys: new Set<string>(),
      availableSortFields: new Set<string>(),
      availableTags: new Set<string>(),
      selection: { kind: "general" as const, notice: null },
    };
    expect(resolveCompetitorPersonalView(input).status).toBe("no_target");
    const result = resolveCompetitorPersonalView({
      ...input,
      explicitScope: { device: "mobile", engine: "google", locationId: "removed" },
    });
    expect(result).toMatchObject({
      config: { scope: { locationId: "removed", device: "mobile" } },
      status: "unavailable_scope",
    });
  });
  it("rejects user identity inputs and saved table defaults on dashboard", () => {
    const input = {
      expectedRevision: 0,
      projectId: viewProjectId,
      surface: "keywords",
      target: { kind: "preset", presetId: "general" },
    };
    expect(setPersonalDefaultSchema.safeParse({ ...input, userId: "another" }).success).toBe(false);
    expect(
      setPersonalDefaultSchema.safeParse({
        ...input,
        surface: "dashboard",
        target: { kind: "saved_view", viewId: requirePublicId(view.id, "viw") },
      }).success,
    ).toBe(false);
  });
});
