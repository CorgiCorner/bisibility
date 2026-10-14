import { type NextSearchParams, parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { resolveKeywordPersonalView } from "@/lib/project-surface-preferences/keyword-resolver";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import { resolvePersonalViewSelection } from "@/lib/project-surface-preferences/selection-resolver";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";

export function personalContextFixture(
  projectId: string,
  params: NextSearchParams,
  views: readonly CanonicalSavedViewResource[],
) {
  const parsed = parseRankTrackerQuery(params),
    preference = generalPreference(projectId, "keywords");
  const selection = resolvePersonalViewSelection({
    explicitViewId: parsed.state.savedViewId,
    explicitViewPresent: parsed.present.has("savedViewId"),
    preference,
    projectId,
    surface: "keywords",
    views,
  });
  return {
    ...resolveKeywordPersonalView({
      parsed,
      selection,
      personalPresentation: null,
      availableLocationIds: new Set(),
      availableTags: new Set(["saved"]),
    }),
    preference,
    views,
    privateCreation: { canCreatePrivate: false, reason: "temporarily_unavailable" as const },
    activeView: selection.kind === "saved_view" ? selection.view : null,
    scopeKey: "synthetic-personal-keyword-scope",
    explicitGrouping: parsed.present.has("grouped"),
  };
}
