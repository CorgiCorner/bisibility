import type { RestCall } from "./rest-call";
import type { JsonObject, McpToolDefinition } from "./types";

const operations = {
  listAiTrackingTopics: ["GET", "topics"],
  createAiTrackingTopic: ["POST", "topics"],
  updateAiTrackingTopic: ["PATCH", "topics", "topic_id"],
  archiveAiTrackingTopic: ["DELETE", "topics", "topic_id"],
  listAiTrackingPrompts: ["GET", "prompts"],
  createAiTrackingPrompt: ["POST", "prompts"],
  updateAiTrackingPrompt: ["PATCH", "prompts", "prompt_id"],
  archiveAiTrackingPrompt: ["DELETE", "prompts", "prompt_id"],
  listAiTrackingSchedules: ["GET", "schedules"],
  createAiTrackingSchedule: ["POST", "schedules"],
  updateAiTrackingSchedule: ["PATCH", "schedules", "schedule_id"],
  archiveAiTrackingSchedule: ["DELETE", "schedules", "schedule_id"],
  previewAiTrackingRun: ["POST", "runs/preview"],
  createAiTrackingRun: ["POST", "runs"],
  listAiTrackingRuns: ["GET", "runs"],
  getAiTrackingRun: ["GET", "runs", "run_id"],
  listAiTrackingSamples: ["GET", "runs", "run_id", "samples"],
  cancelAiTrackingRun: ["POST", "runs", "run_id", "cancel"],
  retryAiTrackingRun: ["POST", "runs", "run_id", "retry"],
  getAiTrackingHistory: ["GET", "history"],
  getAiTrackingTrends: ["GET", "trends"],
  exportAiTrackingEvidence: ["GET", "export"],
  suggestAiTrackingPrompts: ["POST", "suggestions"],
  acceptAiTrackingSuggestions: ["POST", "suggestions/accept"],
  aiTrackingSuggestionsPreview: ["POST", "suggestions/preview"],
  aiTrackingSuggestionsGenerate: ["POST", "suggestions/generate"],
} as const;
function required(input: JsonObject, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}
export function dispatchAiTrackingTool(name: string, input: JsonObject): RestCall | null {
  if (!(name in operations)) return null;
  const [method, resource, member, action] = operations[
    name as keyof typeof operations
  ] as readonly [RestCall["method"], string, string?, string?];
  let path = `/projects/${required(input, "project_id")}/ai-tracking/${resource}`;
  if (member) path += `/${required(input, member)}`;
  if (action) path += `/${action}`;
  const query = new URLSearchParams();
  if (method === "GET")
    for (const key of ["limit", "cursor", "run_id", "previous_run_id"]) {
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
export const aiTrackingToolDefinitions: McpToolDefinition[] = Object.entries(operations).map(
  ([name, route]) => {
    const preview = name === "previewAiTrackingRun" || name === "aiTrackingSuggestionsPreview";
    const readOnly = route[0] === "GET" || preview || name === "suggestAiTrackingPrompts";
    return {
      name,
      title: name.replace(/([A-Z])/g, " $1").trim(),
      description: preview
        ? "Spend-free AI tracking capability and budget preview. Never submits a provider task."
        : "Project-scoped AI tracking operation. Preserve evidence provenance, partial/unknown states, and explicit budget consent. Writes never trigger an automatic baseline.",
      annotations: {
        destructiveHint: route[0] === "DELETE",
        openWorldHint: name === "createAiTrackingRun" || name === "aiTrackingSuggestionsGenerate",
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

export const aiTrackingToolOperationNames = Object.fromEntries(
  Object.keys(operations).map((name) => [
    name,
    name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
  ]),
);
export const aiTrackingToolSchemas = Object.fromEntries(
  aiTrackingToolDefinitions.map((tool) => [tool.name, tool.inputSchema]),
);
