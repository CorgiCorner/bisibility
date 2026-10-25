import type { RestCall } from "./rest-call";
import type { JsonObject, McpToolDefinition } from "./types";

const operations = {
  listPromptTrackerTopics: ["GET", "topics"],
  createPromptTrackerTopic: ["POST", "topics"],
  updatePromptTrackerTopic: ["PATCH", "topics", "topic_id"],
  archivePromptTrackerTopic: ["DELETE", "topics", "topic_id"],
  listPromptTrackerPrompts: ["GET", "prompts"],
  createPromptTrackerPrompt: ["POST", "prompts"],
  updatePromptTrackerPrompt: ["PATCH", "prompts", "prompt_id"],
  archivePromptTrackerPrompt: ["DELETE", "prompts", "prompt_id"],
  listPromptTrackerSchedules: ["GET", "schedules"],
  createPromptTrackerSchedule: ["POST", "schedules"],
  updatePromptTrackerSchedule: ["PATCH", "schedules", "schedule_id"],
  archivePromptTrackerSchedule: ["DELETE", "schedules", "schedule_id"],
  previewPromptTrackerRun: ["POST", "runs/preview"],
  createPromptTrackerRun: ["POST", "runs"],
  listPromptTrackerRuns: ["GET", "runs"],
  getPromptTrackerRun: ["GET", "runs", "run_id"],
  listPromptTrackerSamples: ["GET", "runs", "run_id", "samples"],
  cancelPromptTrackerRun: ["POST", "runs", "run_id", "cancel"],
  retryPromptTrackerRun: ["POST", "runs", "run_id", "retry"],
  getPromptTrackerHistory: ["GET", "history"],
  getPromptTrackerTrends: ["GET", "trends"],
  exportPromptTrackerEvidence: ["GET", "export"],
  suggestPromptResearchPrompts: ["POST", "suggestions"],
  acceptPromptResearchSuggestions: ["POST", "suggestions/accept"],
  promptResearchSuggestionsPreview: ["POST", "suggestions/preview"],
  promptResearchSuggestionsGenerate: ["POST", "suggestions/generate"],
} as const;
function required(input: JsonObject, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}
export function dispatchPromptTrackerTool(name: string, input: JsonObject): RestCall | null {
  if (!(name in operations)) return null;
  const [method, resource, member, action] = operations[
    name as keyof typeof operations
  ] as readonly [RestCall["method"], string, string?, string?];
  const promptResearch =
    name === "suggestPromptResearchPrompts" ||
    name === "acceptPromptResearchSuggestions" ||
    name.startsWith("promptResearch");
  const root = promptResearch ? "prompt-research" : "prompt-tracker";
  let path = `/projects/${required(input, "project_id")}/${root}/${resource}`;
  if (member) path += `/${required(input, member)}`;
  if (action) path += `/${action}`;
  const query = new URLSearchParams();
  if (method === "GET")
    for (const key of ["limit", "cursor", "run_id", "previous_run_id", "format"]) {
      const value = input[key];
      if (key === member) continue;
      if (typeof value === "string" || typeof value === "number") query.set(key, String(value));
    }
  if (query.size) path += `?${query}`;
  return {
    method,
    path,
    projectId: input.project_id as string,
    body:
      method !== "GET" && method !== "DELETE"
        ? Object.fromEntries(
            Object.entries(input).filter(
              ([key]) => !["project_id", member, "idempotency_key"].includes(key),
            ),
          )
        : undefined,
    idempotencyKey: typeof input.idempotency_key === "string" ? input.idempotency_key : undefined,
  };
}
export const promptTrackerToolDefinitions: McpToolDefinition[] = Object.entries(operations).map(
  ([name, route]) => {
    const preview =
      name === "previewPromptTrackerRun" || name === "promptResearchSuggestionsPreview";
    const readOnly = route[0] === "GET" || preview || name === "suggestPromptResearchPrompts";
    return {
      name,
      title: name.replace(/([A-Z])/g, " $1").trim(),
      description:
        name.startsWith("promptResearch") || name.includes("PromptResearch")
          ? preview
            ? "Spend-free Prompt Research suggestion preview. Never submits a provider task."
            : "Prompt Research suggestions to review. Accepted drafts become Prompt Tracker prompts."
          : preview
            ? "Spend-free Prompt Tracker capability and budget preview. Never submits a provider task."
            : "Project-scoped Prompt Tracker operation. Preserve evidence provenance, partial/unknown states, and explicit budget consent. Writes never trigger an automatic baseline.",
      annotations: {
        destructiveHint: route[0] === "DELETE",
        openWorldHint:
          name === "createPromptTrackerRun" || name === "promptResearchSuggestionsGenerate",
        readOnlyHint: readOnly,
      },
      execution: { taskSupport: "forbidden" },
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          topic_id: { type: "string" },
          prompt_id: { type: "string" },
          schedule_id: { type: "string" },
          run_id: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: "string", maxLength: 512 },
          consent: { type: "boolean" },
        },
        required: ["project_id", ...(route[2] ? [route[2]] : [])],
        additionalProperties: true,
      },
    };
  },
);

export const promptTrackerToolOperationNames = Object.fromEntries(
  Object.keys(operations).map((name) => [
    name,
    name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
  ]),
);
export const promptTrackerToolSchemas = Object.fromEntries(
  promptTrackerToolDefinitions.map((tool) => [tool.name, tool.inputSchema]),
);
