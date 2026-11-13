"use server";

import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import { loadAiVisibilityOverview } from "@/lib/ai-tracking/queries/overview";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { getActionActor, requireProjectScope } from "./_shared";

export async function getAiVisibilityOverview(
  projectRef: string,
  query: AiVisibilityQuery,
  timeZone: string,
) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectRef, { type: "competitor" });
  return loadAiVisibilityOverview({
    canAddCompetitor:
      canProjectAction(getProjectRole(actor, project.id), "create", "competitor") &&
      !isProjectReadOnly(project.writeMode),
    now: new Date(),
    projectId: project.id,
    query,
    timeZone,
  });
}
