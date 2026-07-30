import "server-only";

import { ApiAuthError, authenticateBearer } from "@/lib/api/auth";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, methodNotAllowed } from "@/lib/api/responses";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createBisibilityMcpServer } from "./server";

const methods = ["DELETE", "GET", "POST"] as const;

function bearerToken(req: Request) {
  const header = req.headers.get("authorization");
  if (!header) {
    throw new ApiAuthError("A bearer API key is required.");
  }

  const [scheme, token, extra] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw new ApiAuthError("A bearer API key is required.");
  }

  return token;
}

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
  const apiKey = bearerToken(req);
  const auth = await authenticateBearer(req);
  const identity =
    auth.kind === "personal_token"
      ? ({ id: auth.token.id, kind: "personal-token" } as const)
      : ({ id: auth.apiKey.id, kind: "api-key" } as const);
  const limit = await checkRateLimit(req, identity);
  if (!limit.success) {
    return { response: rateLimitExceeded(limit) };
  }

  return { apiKey };
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

  const server = createBisibilityMcpServer({ apiKey: auth.apiKey });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  return transport.handleRequest(req);
}
