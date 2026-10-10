import { getMcpToolDefinitions } from "./definitions";

export const aiTrackingToolNames = {
  listAiTrackingTopics: "list_ai_tracking_topics",
  createAiTrackingTopic: "create_ai_tracking_topic",
  updateAiTrackingTopic: "update_ai_tracking_topic",
  archiveAiTrackingTopic: "archive_ai_tracking_topic",
  listAiTrackingPrompts: "list_ai_tracking_prompts",
  createAiTrackingPrompt: "create_ai_tracking_prompt",
  updateAiTrackingPrompt: "update_ai_tracking_prompt",
  archiveAiTrackingPrompt: "archive_ai_tracking_prompt",
  listAiTrackingSchedules: "list_ai_tracking_schedules",
  createAiTrackingSchedule: "create_ai_tracking_schedule",
  updateAiTrackingSchedule: "update_ai_tracking_schedule",
  archiveAiTrackingSchedule: "archive_ai_tracking_schedule",
  previewAiTrackingRun: "preview_ai_tracking_run",
  createAiTrackingRun: "create_ai_tracking_run",
  listAiTrackingRuns: "list_ai_tracking_runs",
  getAiTrackingRun: "get_ai_tracking_run",
  listAiTrackingSamples: "list_ai_tracking_samples",
  cancelAiTrackingRun: "cancel_ai_tracking_run",
  retryAiTrackingRun: "retry_ai_tracking_run",
  getAiTrackingHistory: "get_ai_tracking_history",
  getAiTrackingTrends: "get_ai_tracking_trends",
  exportAiTrackingEvidence: "export_ai_tracking_evidence",
  suggestAiTrackingPrompts: "suggest_ai_tracking_prompts",
  acceptAiTrackingSuggestions: "accept_ai_tracking_suggestions",
  aiTrackingSuggestionsPreview: "ai_tracking_suggestions_preview",
  aiTrackingSuggestionsGenerate: "ai_tracking_suggestions_generate",
} as const;

type InputSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

export function aiTrackingSchemas() {
  const definitions = getMcpToolDefinitions();
  return Object.fromEntries(
    Object.entries(aiTrackingToolNames).map(([operation, name]) => {
      const definition = definitions.find((tool) => tool.name === name);
      if (!definition) throw new Error(`Missing AI tracking tool schema: ${name}`);
      return [operation, definition.inputSchema];
    }),
  ) as Record<keyof typeof aiTrackingToolNames, InputSchema>;
}
