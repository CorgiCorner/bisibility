import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import type { CompetitorObservation } from "@/lib/competitors/types";
import type { CanonicalSavedViewRecord } from "@/lib/saved-views/canonical-model";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { dashboardComparisonSelectionSchema } from "./selection";

export const comparisonProject = {
  id: "db-project",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
  domain: "example.test",
};
export const comparisonSelection = dashboardComparisonSelectionSchema.parse({
  viewId: "viw_abcdefghijklmnopqrstuvwx",
  revision: 3,
});
export const comparisonContext = sessionSavedViewContext({ id: "viewer" });
export const comparisonAsOf = new Date("2026-10-12T12:00:00Z");
export function comparisonConfig(): CompetitorSavedViewConfig {
  return {
    surface: "competitors",
    version: 1,
    scope: { device: "mobile", engine: "google", locationId: "loc" },
    filters: { excludedKeywordIds: [], position: "all", tag: null },
  };
}
export function comparisonView(): CanonicalSavedViewRecord & { projectId: string } {
  return {
    id: "db-view",
    publicId: comparisonSelection.viewId,
    projectId: comparisonProject.id,
    revision: 3,
    visibility: "private",
    ownerId: "viewer",
    createdById: "viewer",
    name: "Krakow mobile",
    config: comparisonConfig(),
    createdAt: comparisonAsOf,
    surface: "competitors",
  };
}
export function comparisonObservation(
  id: string,
  own = 2,
  rival = 5,
  volume: number | null = 100,
): CompetitorObservation {
  return {
    id,
    keyword: id,
    tags: ["core"],
    volume,
    completed: true,
    ranked: true,
    checkedAt: comparisonAsOf.toISOString(),
    ranks: { "example.test": own, "rival.test": rival },
    quality: {
      "example.test": { evidence: "positive", freshness: "fresh", reason: null },
      "rival.test": { evidence: "positive", freshness: "fresh", reason: null },
    },
  };
}
