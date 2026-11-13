"use server";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { getAiResearchPage } from "@/lib/actions/ai-research";
import { loadModelPlaygroundContext } from "@/lib/ai-research/model-playground-context";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { getProjectRole } from "@/lib/auth/authorize";

export async function getModelPlaygroundPage(projectId: string) {
  const research = await getAiResearchPage(projectId, "prompt");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  const context = await loadModelPlaygroundContext(project.id);
  return {
    ...research,
    ...context,
    canTrack: canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode),
  };
}
