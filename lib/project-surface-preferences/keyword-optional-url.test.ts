import { requirePublicId } from "@/lib/db/public-id";
import { type NextSearchParams, parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { canonicalViewFixture, viewProjectId } from "@/lib/saved-views/view-test-fixture";
import { describe, expect, it } from "vitest";
import { resolveKeywordPersonalView } from "./keyword-resolver";
import { generalPreference } from "./model";
import { resolvePersonalViewSelection } from "./selection-resolver";

const view = canonicalViewFixture();
function resolve(params: NextSearchParams, withSavedDefault = false, available = true) {
  const parsed = parseRankTrackerQuery(params);
  const preference = generalPreference(viewProjectId, "keywords");
  const selection = resolvePersonalViewSelection({
    explicitViewId: parsed.state.savedViewId,
    explicitViewPresent: parsed.present.has("savedViewId"),
    preference: withSavedDefault
      ? {
          ...preference,
          defaultTarget: { kind: "saved_view", viewId: requirePublicId(view.id, "viw") },
        }
      : preference,
    projectId: viewProjectId,
    surface: "keywords",
    views: [view],
  });
  return {
    parsed,
    result: resolveKeywordPersonalView({
      availableLocationIds: new Set(available ? ["krakow"] : []),
      availableTags: new Set(available ? ["Service"] : []),
      parsed,
      selection,
    }),
  };
}

describe("real optional URL parser feeding personal keyword view precedence", () => {
  it("allows General with an empty URL", () => {
    const { parsed, result } = resolve({});
    expect(parsed.issues).toEqual([]);
    expect(result).toMatchObject({
      missingScope: [],
      state: { grouped: false, savedViewId: null, sort: { direction: "asc", field: "keyword" } },
      status: "ready",
    });
  });

  it("inherits the retained saved-v2 default when no URL field is supplied", () => {
    const { parsed, result } = resolve({}, true);
    expect(parsed.issues).toEqual([]);
    expect(result).toMatchObject({
      state: {
        grouped: true,
        pageSize: 100,
        search: "service",
        sort: { direction: "desc", field: "change" },
        lens: { device: "mobile", locationId: "krakow" },
        filters: { tags: ["Service"], wrongUrl: true },
      },
      status: "ready",
    });
  });

  it("lets explicit keyword A–Z override the saved-v2 sorting", () => {
    const { result } = resolve({ sort: "keyword", dir: "asc" }, true);
    expect(result.state.sort).toEqual({ direction: "asc", field: "keyword" });
    expect(result.state.search).toBe("service");
  });

  it("lets explicit empty and false clear retained constraints without mutating parsed state", () => {
    const params = { q: "", tags: "", location: "", contains: "", grouped: "0", wrongUrl: "0" };
    const before = parseRankTrackerQuery(params);
    const { parsed, result } = resolve(params, true, false);
    expect(parsed).toEqual(before);
    expect(parsed.issues).toEqual([]);
    expect(result).toMatchObject({
      missingScope: [],
      state: {
        grouped: false,
        search: "",
        lens: { device: "mobile", locationId: null },
        filters: { tags: [], contains: "", wrongUrl: false },
      },
      status: "ready",
    });
  });

  it("lets an explicit empty view select General rather than the saved default", () => {
    const { parsed, result } = resolve({ view: "" }, true);
    expect(parsed.issues).toEqual([]);
    expect(result).toMatchObject({
      state: { savedViewId: null, grouped: false, search: "" },
      status: "ready",
    });
  });

  it.each([
    { grouped: "sideways" },
    { location: "x".repeat(121) },
    { view: "x".repeat(121) },
    { q: "x".repeat(121) },
  ])("still refuses a present malformed URL $0", (params) => {
    const { parsed, result } = resolve(params, true);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(result.status).toBe("invalid_url");
  });

  it("does not turn an inaccessible explicit saved-view reference into General", () => {
    const { parsed, result } = resolve({ view: "viw_missing" }, true);
    expect(parsed.issues).toEqual([]);
    expect(result.status).toBe("unavailable_view");
  });

  it("retains missing saved scope as unavailable rather than widening its selection", () => {
    const { parsed, result } = resolve({}, true, false);
    expect(parsed.issues).toEqual([]);
    expect(result).toMatchObject({
      missingScope: ["location", "tags"],
      state: { lens: { locationId: "krakow" }, filters: { tags: ["Service"] } },
      status: "unavailable_scope",
    });
  });
});
