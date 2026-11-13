import type {
  TrackingPromptRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import type {
  AiVisibilityPromptsModel,
  PromptProjectionPrompt,
} from "@/lib/ai-tracking/prompts-model";
import {
  projectPromptOutcomes,
  scheduledPromptEngines,
} from "@/lib/ai-tracking/prompts-projection";
import type { AiVisibilityPromptAnswers } from "@/lib/ai-tracking/queries/prompts";

export function promptProjectionFromWorkspace(
  prompts: readonly Pick<
    TrackingPromptRow,
    "id" | "revision" | "sourceProvenance" | "status" | "text" | "topicId" | "topicName"
  >[],
  schedules: Parameters<typeof scheduledPromptEngines>[1],
): PromptProjectionPrompt[] {
  return prompts.map((prompt) => ({
    configuredEngines: scheduledPromptEngines(prompt.id, schedules),
    id: prompt.id,
    provenance: prompt.sourceProvenance ?? "manual",
    revision: prompt.revision,
    status: prompt.status,
    text: prompt.text,
    topicId: prompt.topicId,
    topicName: prompt.topicId ? prompt.topicName : null,
  }));
}

export function aiVisibilityPromptsModel(input: {
  answers: AiVisibilityPromptAnswers;
  now: Date;
  prompts: readonly TrackingPromptRow[];
  schedules: TrackingWorkspaceData["schedules"];
  selectedPromptId: string | null;
  timeZone: string;
}): AiVisibilityPromptsModel {
  const projected = projectPromptOutcomes({
    answers: input.answers.answers,
    entities: input.answers.entities,
    filters: input.answers.filters,
    prompts: promptProjectionFromWorkspace(input.prompts, input.schedules),
    selectedPromptId: input.selectedPromptId,
    timeZone: input.timeZone,
  });
  return {
    engines: input.answers.engines,
    entities: input.answers.entities,
    filters: input.answers.filters,
    markets: input.answers.markets,
    now: input.now.toISOString(),
    panel: projected.panel,
    rows: projected.rows,
    truncated: input.answers.truncated,
  };
}
