export interface PromptTrackerOperationPolicy {
  name: string;
  scope: "read" | "write";
}
export function promptTrackerOperationPolicy(
  method: string,
  path: readonly string[],
): PromptTrackerOperationPolicy | null {
  if (path[0] !== "projects") return null;
  if (path[2] === "prompt-research") return promptResearchOperationPolicy(method, path);
  if (path[2] !== "prompt-tracker") return null;
  const resource = path[3];
  const member = path[4];
  const action = path[5];
  const collection = { topics: "Topic", prompts: "Prompt", schedules: "Schedule" }[
    resource as "topics" | "prompts" | "schedules"
  ];
  if (collection && path.length <= 5) {
    if (method === "GET" && !member)
      return { name: `listPromptTracker${collection}s`, scope: "read" };
    if (method === "POST" && !member)
      return { name: `createPromptTracker${collection}`, scope: "write" };
    if (method === "PATCH" && member)
      return { name: `updatePromptTracker${collection}`, scope: "write" };
    if (method === "DELETE" && member)
      return { name: `archivePromptTracker${collection}`, scope: "write" };
  }
  if (resource === "runs" && path.length <= 6) {
    if (method === "POST" && member === "preview" && path.length === 5)
      return { name: "previewPromptTrackerRun", scope: "read" };
    if (method === "POST" && !member) return { name: "createPromptTrackerRun", scope: "write" };
    if (method === "GET" && !member) return { name: "listPromptTrackerRuns", scope: "read" };
    if (method === "GET" && member && !action)
      return { name: "getPromptTrackerRun", scope: "read" };
    if (method === "GET" && action === "samples")
      return { name: "listPromptTrackerSamples", scope: "read" };
    if (method === "POST" && ["cancel", "retry"].includes(action))
      return {
        name: action === "cancel" ? "cancelPromptTrackerRun" : "retryPromptTrackerRun",
        scope: "write",
      };
  }
  if (method === "GET" && path.length === 4 && ["history", "trends", "export"].includes(resource))
    return {
      name:
        resource === "history"
          ? "getPromptTrackerHistory"
          : resource === "trends"
            ? "getPromptTrackerTrends"
            : "exportPromptTrackerEvidence",
      scope: "read",
    };
  return null;
}

function promptResearchOperationPolicy(
  method: string,
  path: readonly string[],
): PromptTrackerOperationPolicy | null {
  if (method !== "POST" || path[3] !== "suggestions") return null;
  const member = path[4];
  if ((member === "preview" || member === "generate") && path.length === 5)
    return {
      name:
        member === "preview"
          ? "promptResearchSuggestionsPreview"
          : "promptResearchSuggestionsGenerate",
      scope: member === "preview" ? "read" : "write",
    };
  if (!member && path.length === 4) return { name: "suggestPromptResearchPrompts", scope: "read" };
  if (member === "accept" && path.length === 5)
    return { name: "acceptPromptResearchSuggestions", scope: "write" };
  return null;
}
