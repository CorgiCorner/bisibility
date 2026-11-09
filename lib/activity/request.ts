export const ACTIVITY_METHOD_HEADER = "x-bisibility-request-method";

/** Only app pages, onboarding and session-authenticated API routes can be interactive. */
export function sessionActivityKind(
  path: string | null,
  method: string | null,
  action: string | null,
) {
  if (!path || !method) return null;
  const pathname = path.split("?", 1)[0];
  const page = /^\/(app|cloud|onboarding)(\/|$)/.test(pathname);
  const api =
    /^\/api\//.test(pathname) &&
    !/^\/api\/(auth|v1|mcp|health|telemetry|analytics|webhooks|cron|ingest)(\/|$)/.test(pathname);
  if ((!page && !api) || /^\/api\/private\/billing\/attribution(\/|$)/.test(pathname)) return null;
  const acted =
    (page && method === "POST" && Boolean(action)) ||
    (api && ["POST", "PUT", "PATCH", "DELETE"].includes(method));
  return acted ? "acted" : "seen";
}
