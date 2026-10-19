import { setRequestDiagnosticAttribute } from "@/lib/observability/request-diagnostics";

const protocolErrors = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "invalid_target",
]);

export async function withOAuthTokenDiagnostics(
  request: Request,
  handle: (request: Request) => Promise<Response>,
) {
  const response = await handle(request);
  if (
    new URL(request.url).pathname !== "/api/auth/oauth2/token" ||
    (response.status !== 400 && response.status !== 401)
  )
    return response;

  let category = "unclassified";
  try {
    const { error, code } = await response.clone().json();
    if (typeof error === "string" && protocolErrors.has(error)) category = error;
    else if (code === "VALIDATION_ERROR") category = "validation_error";
  } catch {
    // Diagnostics must preserve non-JSON protocol failures too.
  }
  try {
    setRequestDiagnosticAttribute("auth.oauth.error", category);
  } catch {
    // Optional diagnostics must not change the protocol response.
  }
  return response;
}
