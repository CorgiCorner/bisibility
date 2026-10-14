import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { defaultRankTrackerReportScope } from "@/lib/keywords/rank-tracker-report-scope";
import type { KeywordSavedViewV2Config } from "@/lib/keywords/saved-view-v2-model";
import type { CanonicalSavedViewResource } from "./canonical-model";
import { emptyTablePresentation } from "./presentation-model";

export const viewProjectId = "prj_abcdefghijklmnopqrstuvwx";
export const viewPublicId = "viw_abcdefghijklmnopqrstuvwx";
export function keywordViewFixture(): KeywordSavedViewV2Config {
  return {
    reportScope: { ...defaultRankTrackerReportScope },
    filters: { ...structuredClone(emptyKeywordFilters), tags: ["Service"], wrongUrl: true },
    grouped: true,
    lens: { device: "mobile", locationId: "krakow" },
    pageSize: 100,
    presentation: structuredClone(emptyTablePresentation),
    search: "service",
    sort: { direction: "desc", field: "change" },
    surface: "keywords",
    version: 2,
  };
}

export function canonicalViewFixture(): Extract<
  CanonicalSavedViewResource,
  { surface: "keywords" }
> {
  return {
    canDelete: true,
    canEdit: true,
    config: keywordViewFixture(),
    createdAt: "2026-10-12T00:00:00.000Z",
    id: viewPublicId,
    name: "Service mobile",
    projectId: viewProjectId,
    revision: 1,
    surface: "keywords",
    visibility: "private",
  };
}
