import "server-only";

import { createHash } from "node:crypto";
import { getPersonalSurfacePreference } from "@/lib/project-surface-preferences/query";
import { resolvePersonalViewSelection } from "@/lib/project-surface-preferences/selection-resolver";
import { privateViewCreationCapability } from "@/lib/saved-views/creation-extension";
import { requireReadableProject } from "./_auth";
import { listSessionSavedViews } from "./saved-views";

/** Shared and personal views have the same URL/default precedence in both table surfaces. */
export async function loadCompetitorPersonalContext(
  projectRef: string,
  params: Record<string, string | string[] | undefined>,
) {
  const { actor, project } = await requireReadableProject(projectRef);
  const [views, preference] = await Promise.all([
    listSessionSavedViews(project.publicId, "competitors"),
    getPersonalSurfacePreference(project.publicId, "competitors"),
  ]);
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const selection = resolvePersonalViewSelection({
    explicitViewId: rawView ?? null,
    explicitViewPresent: Object.hasOwn(params, "view"),
    preference,
    projectId: project.publicId,
    surface: "competitors",
    views,
  });
  const activeView = selection.kind === "saved_view" ? selection.view : null;
  return {
    activeView: activeView?.surface === "competitors" ? activeView : null,
    unavailable: selection.kind === "unavailable_explicit_view",
    requestedViewId: rawView ?? null,
    personal: {
      privateCreation: privateViewCreationCapability(),
      views,
      preference: { ...preference, notice: selection.notice ?? preference.notice },
      presentation: preference.presentation,
      scopeKey: createHash("sha256")
        .update(JSON.stringify([actor.id, project.publicId, "competitors", 1]))
        .digest("hex"),
    },
  };
}
