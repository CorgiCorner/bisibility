export interface AiTrackingOperationPolicy {
  name: string;
  scope: "read" | "write";
}
export function aiTrackingOperationPolicy(
  method: string,
  path: readonly string[],
): AiTrackingOperationPolicy | null {
  if (path[0] !== "projects" || path[2] !== "ai-tracking") return null;
  const resource = path[3];
  const member = path[4];
  const action = path[5];
  const collection = { topics: "Topic", prompts: "Prompt", schedules: "Schedule" }[
    resource as "topics" | "prompts" | "schedules"
  ];
  if (collection && path.length <= 5) {
    if (method === "GET" && !member) return { name: `listAiTracking${collection}s`, scope: "read" };
    if (method === "POST" && !member)
      return { name: `createAiTracking${collection}`, scope: "write" };
    if (method === "PATCH" && member)
      return { name: `updateAiTracking${collection}`, scope: "write" };
    if (method === "DELETE" && member)
      return { name: `archiveAiTracking${collection}`, scope: "write" };
  }
  if (resource === "runs" && path.length <= 6) {
    if (method === "POST" && member === "preview" && path.length === 5)
      return { name: "previewAiTrackingRun", scope: "read" };
    if (method === "POST" && !member) return { name: "createAiTrackingRun", scope: "write" };
    if (method === "GET" && !member) return { name: "listAiTrackingRuns", scope: "read" };
    if (method === "GET" && member && !action) return { name: "getAiTrackingRun", scope: "read" };
    if (method === "GET" && action === "samples")
      return { name: "listAiTrackingSamples", scope: "read" };
    if (method === "POST" && ["cancel", "retry"].includes(action))
      return {
        name: action === "cancel" ? "cancelAiTrackingRun" : "retryAiTrackingRun",
        scope: "write",
      };
  }
  if (method === "GET" && path.length === 4 && ["history", "trends", "export"].includes(resource))
    return {
      name:
        resource === "history"
          ? "getAiTrackingHistory"
          : resource === "trends"
            ? "getAiTrackingTrends"
            : "exportAiTrackingEvidence",
      scope: "read",
    };
  if (
    resource === "suggestions" &&
    method === "POST" &&
    path.length === 5 &&
    ["preview", "generate"].includes(member)
  )
    return {
      name: member === "preview" ? "aiTrackingSuggestionsPreview" : "aiTrackingSuggestionsGenerate",
      scope: member === "preview" ? "read" : "write",
    };
  if (
    resource === "suggestions" &&
    method === "POST" &&
    ((!member && path.length === 4) || (member === "accept" && path.length === 5))
  )
    return {
      name: member === "accept" ? "acceptAiTrackingSuggestions" : "suggestAiTrackingPrompts",
      scope: member === "accept" ? "write" : "read",
    };
  return null;
}
