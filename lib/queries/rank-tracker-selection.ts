import "server-only";

import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { requireReadableProject } from "./_auth";
import {
  type RankTrackerSelectionProject,
  resolveRankTrackerExportKeywordIdsForProject,
  selectRankTrackerKeywordsForProject,
} from "./rank-tracker-selection-core";

type AuthorizedProject = RankTrackerSelectionProject;
type ExportSelectionOptions = { membershipLimit?: number | null };

export async function selectRankTrackerKeywords(projectRef: string, query: RankTrackerQueryState) {
  if (query.grouped) throw new Error("Rank tracker list query supports flat mode only.");
  const { project } = await requireReadableProject(projectRef);
  return selectRankTrackerKeywordsForProject(project, query);
}

export async function resolveAuthorizedRankTrackerExportKeywordIds(
  project: AuthorizedProject,
  query: RankTrackerQueryState,
  options?: ExportSelectionOptions,
) {
  return resolveRankTrackerExportKeywordIdsForProject(project, query, options);
}

export async function resolveRankTrackerExportKeywordIds(
  projectRef: string,
  query: RankTrackerQueryState,
) {
  const { project } = await requireReadableProject(projectRef);
  return resolveAuthorizedRankTrackerExportKeywordIds(project, query);
}
