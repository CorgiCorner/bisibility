import type { RestCall } from "./rest-call";
/** A preview stays on the same authenticated REST route and never becomes a save by coercion. */
export function reviewedDefaultsRoute(input: Record<string, unknown>): RestCall {
  const projectId = input.project_id;
  if (typeof projectId !== "string" || !projectId.trim())
    throw new Error("project_id is required.");
  if (input.preview_only !== undefined && typeof input.preview_only !== "boolean")
    throw new Error("preview_only must be a boolean.");
  const query = input.preview_only === undefined ? "" : `?preview_only=${input.preview_only}`;
  const omitted = new Set(["project_id", "preview_only", "idempotency_key", "async"]);
  return {
    path: `/projects/${encodeURIComponent(projectId)}/defaults${query}`,
    method: "PATCH",
    projectId,
    body: Object.fromEntries(Object.entries(input).filter(([name]) => !omitted.has(name))),
    idempotencyKey: typeof input.idempotency_key === "string" ? input.idempotency_key : undefined,
  };
}
