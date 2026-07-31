import "server-only";

import { type ApiAuth, ApiAuthError, authenticateBearer } from "@/lib/api/auth";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, methodNotAllowed } from "@/lib/api/responses";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpOAuthRequest, isApiCredential, requireBearerToken } from "./oauth-auth";
import type { McpApiAuthorization } from "./rest-call";
import { createBisibilityMcpServer } from "./server";

const methods = ["DELETE", "GET", "POST"] as const;

function instance(req: Request) {
  return `urn:bisibility:mcp:${new URL(req.url).pathname}`;
}

function hasInvalidOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(req.url).origin;
  } catch {
    return true;
  }
}

async function authenticateMcpRequest(req: Request) {
  let credential: string | null = null;
  try {
    credential = requireBearerToken(req);
  } catch {
    // The OAuth path returns the standards-based discovery challenge.
  }

  let auth: ApiAuth;
  let authorization: McpApiAuthorization;
  if (credential && isApiCredential(credential)) {
    auth = await authenticateBearer(req);
    authorization = credential;
  } else {
    const oauth = await authenticateMcpOAuthRequest(req);
    if ("response" in oauth) return oauth;
    auth = oauth.auth;
    authorization = oauth.auth;
  }

  const identity =
    auth.kind === "personal_token"
      ? ({ id: auth.token.id, kind: "personal-token" } as const)
      : ({ id: auth.apiKey.id, kind: "api-key" } as const);
  const limit = await checkRateLimit(req, identity);
  if (!limit.success) {
    return { response: rateLimitExceeded(limit) };
  }

  return { authorization };
}

export async function handleMcpHttpRequest(req: Request) {
  const method = req.method.toUpperCase();
  if (!methods.includes(method as (typeof methods)[number])) {
    return methodNotAllowed(methods, { instance: instance(req) });
  }
  if (hasInvalidOrigin(req)) {
    return errorResponse("forbidden", "The MCP request origin is not allowed.", 403, {
      instance: instance(req),
    });
  }

  let auth: Awaited<ReturnType<typeof authenticateMcpRequest>>;
  try {
    auth = await authenticateMcpRequest(req);
  } catch (error) {
    if (!(error instanceof ApiAuthError)) {
      throw error;
    }
    return errorResponse("unauthorized", error.message, 401, { instance: instance(req) });
  }
  if ("response" in auth) {
    return auth.response;
  }

  const server = createBisibilityMcpServer({
    authorization: auth.authorization,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  return transport.handleRequest(req);
}
