"use server";

import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import { loadAiVisibilityPromptAnswers } from "@/lib/ai-tracking/queries/prompts";
import { getActionActor, requireProjectScope } from "./_shared";

export async function getAiVisibilityPromptAnswers(projectRef: string, query: AiVisibilityQuery) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectRef, { type: "project" });
  return loadAiVisibilityPromptAnswers({
    now: new Date(),
    projectId: project.id,
    query,
  });
}
