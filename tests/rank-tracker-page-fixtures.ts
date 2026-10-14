import type { Actor } from "@/lib/auth/authorize";
import type {
  RankTrackerGroupedListResult,
  RankTrackerListResult,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import { keywordViewLegacyScope } from "@/lib/keywords/saved-view-v2-model";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import { reportProject } from "@/lib/rank-reports/report-test-fixture";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import { canonicalViewFixture, keywordViewFixture } from "@/lib/saved-views/view-test-fixture";

export const PAGE_PROJECT_REF = "prj_1";
export const PAGE_PROJECT_ID = reportProject.id;
export const PAGE_ACTOR_ID = "user_1";

export function pageActor(id = PAGE_ACTOR_ID): Actor {
  return { id, memberships: [{ projectId: PAGE_PROJECT_ID, role: "owner" }] };
}
export function pageReadable(actor = pageActor()) {
  return { actor, project: { id: PAGE_PROJECT_ID, publicId: PAGE_PROJECT_REF } };
}
export function pagePreference() {
  return generalPreference(PAGE_PROJECT_REF, "keywords");
}

export function pageView(version: 1 | 2 = 2, grouped = true): CanonicalSavedViewResource {
  const config = { ...keywordViewFixture(), grouped };
  return {
    ...canonicalViewFixture(),
    projectId: PAGE_PROJECT_REF,
    surface: "keywords",
    visibility: version === 1 ? "project" : "private",
    config: version === 1 ? keywordViewLegacyScope(config) : config,
  };
}

const facets = () => ({ intents: [], positions: [], tags: [], topics: [] });
/** Counts are routing fixture metadata, not a whole-scope measurement claim. */
export function pageFlatList(query: RankTrackerQueryState): RankTrackerListResult {
  return {
    facets: facets(),
    locations: [],
    matchedTargetCount: 0,
    page: 1,
    pageCount: 1,
    pageSize: query.pageSize,
    resolvedLens: query.lens,
    rows: [],
    totalCount: 9,
  };
}
export function pageGroupedList(query: RankTrackerQueryState): RankTrackerGroupedListResult {
  const flat = pageFlatList(query);
  return {
    facets: flat.facets,
    groups: [],
    locations: flat.locations,
    matchedGroupCount: 0,
    matchedTargetCount: flat.matchedTargetCount,
    page: flat.page,
    pageCount: flat.pageCount,
    pageSize: flat.pageSize,
    resolvedLens: flat.resolvedLens,
    totalCount: flat.totalCount,
  };
}
