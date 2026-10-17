import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { type NextSearchParams, parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import {
  rankTrackerScope,
  resolveRankTrackerReportTime,
} from "@/lib/keywords/rank-tracker-report-scope";
import { resolveKeywordPersonalView } from "@/lib/project-surface-preferences/keyword-resolver";
import { getPersonalSurfacePreference } from "@/lib/project-surface-preferences/query";
import { resolvePersonalViewSelection } from "@/lib/project-surface-preferences/selection-resolver";
import { privateViewCreationCapability } from "@/lib/saved-views/creation-extension";
import { cache } from "react";
import { requireReadableProject } from "./_auth";
import { listSessionSavedViews } from "./saved-views";

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

// Page and parallel header share inputs, but each resolves its own URL parameters.
const loadPersonalInputs = perRequestCache(async (projectRef: string) => {
  const { actor, project } = await requireReadableProject(projectRef);
  const [views, preference, locations, markets, tags] = await Promise.all([
    listSessionSavedViews(project.publicId, "keywords"),
    getPersonalSurfacePreference(project.publicId, "keywords"),
    prisma.keyword.findMany({
      where: { projectId: project.id, archivedAt: null },
      select: { locationRef: { select: { canonicalKey: true } } },
      distinct: ["locationId"],
    }),
    prisma.projectMarket.findMany({
      where: { projectId: project.id, status: { in: ["active", "paused"] } },
      select: { location: { select: { canonicalKey: true } } },
    }),
    prisma.tag.findMany({ where: { projectId: project.id }, select: { name: true } }),
  ]);
  return { actor, project, views, preference, locations, markets, tags };
});

/** Scope validation precedes the data query; suggestions or one table page are not its universe. */
export async function loadRankTrackerPersonalContext(projectRef: string, params: NextSearchParams) {
  const { actor, project, views, preference, locations, markets, tags } =
    await loadPersonalInputs(projectRef);
  const parsed = parseRankTrackerQuery(params);
  const selection = resolvePersonalViewSelection({
    explicitViewId: parsed.state.savedViewId,
    explicitViewPresent: parsed.present.has("savedViewId"),
    preference,
    projectId: project.publicId,
    surface: "keywords",
    views,
  });
  const resolution = resolveKeywordPersonalView({
    parsed,
    selection,
    personalPresentation: preference.presentation,
    availableLocationIds: new Set([
      ...locations.map((row) => row.locationRef.canonicalKey),
      ...markets.map((row) => row.location.canonicalKey),
    ]),
    availableTags: new Set(tags.map((row) => row.name)),
  });
  try {
    resolveRankTrackerReportTime(rankTrackerScope(resolution.state));
  } catch {
    resolution.status = "invalid_url";
  }
  return {
    ...resolution,
    privateCreation: privateViewCreationCapability(),
    preference,
    views,
    activeView: selection.kind === "saved_view" ? selection.view : null,
    scopeKey: createHash("sha256")
      .update(JSON.stringify([actor.id, project.publicId, "keywords", 1]))
      .digest("hex"),
    explicitGrouping:
      (parsed.present.has("grouped") && !parsed.issues.includes("grouped")) ||
      (selection.kind === "saved_view" && selection.view.config.version === 2),
  };
}
