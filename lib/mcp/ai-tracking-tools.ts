import { operationPolicy } from "@/lib/api/operation-policy";
import { operationPath } from "./operation-path";
import type { RestCall } from "./rest-call";
import type { JsonObject, McpToolDefinition } from "./types";

// MCP membership remains an explicit opt-in, independent of new REST policies.
const operations = [
  "listPromptTrackerTopics",
  "createPromptTrackerTopic",
  "updatePromptTrackerTopic",
  "archivePromptTrackerTopic",
  "listPromptTrackerPrompts",
  "createPromptTrackerPrompt",
  "updatePromptTrackerPrompt",
  "archivePromptTrackerPrompt",
  "listPromptTrackerSchedules",
  "createPromptTrackerSchedule",
  "updatePromptTrackerSchedule",
  "archivePromptTrackerSchedule",
  "previewPromptTrackerRun",
  "createPromptTrackerRun",
  "listPromptTrackerRuns",
  "getPromptTrackerRun",
  "listPromptTrackerSamples",
  "cancelPromptTrackerRun",
  "retryPromptTrackerRun",
  "getPromptTrackerHistory",
  "getPromptTrackerTrends",
  "exportPromptTrackerEvidence",
  "suggestPromptResearchPrompts",
  "acceptPromptResearchSuggestions",
  "promptResearchSuggestionsPreview",
  "promptResearchSuggestionsGenerate",
] as const;

function memberParameter(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)][1]?.[1];
}
export function dispatchPromptTrackerTool(name: string, input: JsonObject): RestCall | null {
  const operation = operations.find((candidate) => candidate === name);
  if (!operation) return null;
  const { method, path: pattern } = operationPolicy[operation];
  if (method === "PUT") return null;
  const member = memberParameter(pattern);
  let path = operationPath(operation, input);
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
export const promptTrackerToolDefinitions: McpToolDefinition[] = operations.map((name) => {
  const route = operationPolicy[name];
  const member = memberParameter(route.path);
  const preview = name === "previewPromptTrackerRun" || name === "promptResearchSuggestionsPreview";
  const readOnly = route.method === "GET" || preview || name === "suggestPromptResearchPrompts";
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
      destructiveHint: route.method === "DELETE",
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
      required: ["project_id", ...(member ? [member] : [])],
      additionalProperties: true,
    },
  };
});

export const promptTrackerToolOperationNames = Object.fromEntries(
  operations.map((name) => [name, name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]),
);
export const promptTrackerToolSchemas = Object.fromEntries(
  promptTrackerToolDefinitions.map((tool) => [tool.name, tool.inputSchema]),
);
