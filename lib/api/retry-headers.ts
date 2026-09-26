import type { ApiContext } from "./context";

export function retryHeaders(
  ctx: Pick<ApiContext, "headers">,
  resetAt: number | undefined,
  fallbackMs: number,
) {
  const headers = new Headers(ctx.headers);
  const retryAfter = String(
    Math.max(1, Math.ceil(((resetAt ?? Date.now() + fallbackMs) - Date.now()) / 1_000)),
  );
  headers.set("Retry-After", retryAfter);
  headers.set("RateLimit-Reset", retryAfter);
  return headers;
}
