import { consume } from "./ratelimit";
import { errorResponse } from "./responses";

export const MODEL_PLAYGROUND_ESTIMATE_LIMIT = 60;
const WINDOW_SECONDS = 60;

/** Read estimates are cheap to ask for, so they get their own bucket per credential and project,
 * well below the general API limit. Returns a 429 response when the bucket is exhausted. */
export async function consumeModelPlaygroundEstimateLimit(input: {
  credentialKind: string | null;
  credentialId: string | null;
  projectId: string;
  headers: Headers;
  instance?: string;
}): Promise<Response | null> {
  const result = await consume({
    prefix: "bisibility:api:v1:model-playground-estimate",
    bucketKey: `${input.credentialKind ?? "none"}:${input.credentialId ?? "none"}:${input.projectId}`,
    limit: MODEL_PLAYGROUND_ESTIMATE_LIMIT,
    windowSeconds: WINDOW_SECONDS,
  });
  if (result.success) return null;
  const headers = new Headers(input.headers);
  const reset = String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
  headers.set("Retry-After", reset);
  return errorResponse("rate_limited", "Model Playground estimate rate limit exceeded.", 429, {
    headers,
    ...(input.instance ? { instance: input.instance } : {}),
  });
}
