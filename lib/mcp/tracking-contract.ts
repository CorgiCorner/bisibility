import { getMcpToolDefinitions } from "./definitions";

export const promptTrackerToolNames = {
  listPromptTrackerTopics: "list_prompt_tracker_topics",
  createPromptTrackerTopic: "create_prompt_tracker_topic",
  updatePromptTrackerTopic: "update_prompt_tracker_topic",
  archivePromptTrackerTopic: "archive_prompt_tracker_topic",
  listPromptTrackerPrompts: "list_prompt_tracker_prompts",
  createPromptTrackerPrompt: "create_prompt_tracker_prompt",
  updatePromptTrackerPrompt: "update_prompt_tracker_prompt",
  archivePromptTrackerPrompt: "archive_prompt_tracker_prompt",
  listPromptTrackerSchedules: "list_prompt_tracker_schedules",
  createPromptTrackerSchedule: "create_prompt_tracker_schedule",
  updatePromptTrackerSchedule: "update_prompt_tracker_schedule",
  archivePromptTrackerSchedule: "archive_prompt_tracker_schedule",
  previewPromptTrackerRun: "preview_prompt_tracker_run",
  createPromptTrackerRun: "create_prompt_tracker_run",
  listPromptTrackerRuns: "list_prompt_tracker_runs",
  getPromptTrackerRun: "get_prompt_tracker_run",
  listPromptTrackerSamples: "list_prompt_tracker_samples",
  cancelPromptTrackerRun: "cancel_prompt_tracker_run",
  retryPromptTrackerRun: "retry_prompt_tracker_run",
  getPromptTrackerHistory: "get_prompt_tracker_history",
  getPromptTrackerTrends: "get_prompt_tracker_trends",
  exportPromptTrackerEvidence: "export_prompt_tracker_evidence",
  suggestPromptResearchPrompts: "suggest_prompt_research_prompts",
  acceptPromptResearchSuggestions: "accept_prompt_research_suggestions",
  promptResearchSuggestionsPreview: "prompt_research_suggestions_preview",
  promptResearchSuggestionsGenerate: "prompt_research_suggestions_generate",
} as const;

type InputSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

export function promptTrackerSchemas() {
  const definitions = getMcpToolDefinitions();
  return Object.fromEntries(
    Object.entries(promptTrackerToolNames).map(([operation, name]) => {
      const definition = definitions.find((tool) => tool.name === name);
      if (!definition) throw new Error(`Missing tool schema: ${name}`);
      return [operation, definition.inputSchema];
    }),
  ) as Record<keyof typeof promptTrackerToolNames, InputSchema>;
}
