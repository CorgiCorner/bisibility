import type { ProviderRequest } from "@usagekit/providers";

const QUEUED = "/v3/serp/google/organic/task_post";
const LIVE = "/v3/serp/google/organic/live/advanced";
const FIELDS = new Set([
  "keyword",
  "location_code",
  "location_name",
  "language_code",
  "language_name",
  "device",
  "depth",
  "priority",
  "search_param",
  "find_targets_in",
  "stop_crawl_on_match",
  "tag",
]);

/** The admitted body was produced by the transport's builder, never rebuilt from mutable state. */
export function dispatchPayload(request: ProviderRequest) {
  const endpointPath = new URL(request.url).pathname;
  if (request.method !== "POST" || ![QUEUED, LIVE].includes(endpointPath) || !request.body)
    throw new Error("Unsupported rank dispatch payload");
  const tasks: unknown = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  if (!Array.isArray(tasks) || tasks.length !== 1 || !tasks[0] || typeof tasks[0] !== "object")
    throw new Error("Rank dispatch requires one canonical task");
  const payload = tasks[0] as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !FIELDS.has(key)))
    throw new Error("Unexpected rank dispatch payload field");
  // Canonical key order gives identical task objects the same digest across retries.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return value;
  };
  return {
    endpointPath,
    payload: canonical(payload) as Record<string, unknown>,
    executionMode: endpointPath === QUEUED ? "queued" : "live",
  };
}
