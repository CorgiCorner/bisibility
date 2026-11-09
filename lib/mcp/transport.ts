import "server-only";

import { recordUserActivity } from "@/lib/activity/record-extension";
import { type ApiAuth, ApiAuthError, authenticateBearer } from "@/lib/api/auth";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, methodNotAllowed } from "@/lib/api/responses";
import { awaitWithSignal, withDeadline } from "@/lib/async/abort";
import { MCP_RESOURCE_URL } from "@/lib/auth/auth";
import {
  isTransientRequestFailure,
  reportRequestFailure,
  requestFailureContext,
  setRequestFailureMetadata,
  setRequestFailureStage,
  withRequestFailureContext,
} from "@/lib/observability/request-failure";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  dshPluginMinVersion,
  isBelowDshPluginFloor,
  recordMcpClient,
  resolveMcpClient,
  updateRequiredResponse,
} from "./client-version-gate";
import { mcpFailureResponse, normalizeMcpFailure } from "./error-envelope";
import { authenticateMcpOAuthRequest, isApiCredential, requireBearerToken } from "./oauth-auth";
import { readMcpRequestMetadata } from "./request-id";
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
    return new URL(origin).origin !== new URL(MCP_RESOURCE_URL).origin;
  } catch {
    return true;
  }
}

async function authenticateMcpRequest(req: Request, signal: AbortSignal) {
  let credential: string | null = null;
  try {
    credential = requireBearerToken(req);
  } catch {
    // The OAuth path returns the standards-based discovery challenge.
  }

  let auth: ApiAuth;
  let authorization: McpApiAuthorization;
  if (credential && isApiCredential(credential)) {
    setRequestFailureStage("credential_auth");
    auth = await awaitWithSignal(() => authenticateBearer(req), signal);
    authorization = credential;
  } else {
    setRequestFailureStage("oauth_auth");
    const oauth = await awaitWithSignal(() => authenticateMcpOAuthRequest(req), signal);
    if ("response" in oauth) return oauth;
    auth = oauth.auth;
    authorization = oauth.auth;
  }

  const user = auth.kind === "personal_token" ? auth.user : null;
  if (user)
    recordUserActivity({
      userId: user.id,
      email: user.email,
      channel: "mcp",
      kind: "seen",
      interactive: true,
    });
  const identity =
    auth.kind === "personal_token"
      ? ({ id: auth.token.id, kind: "personal-token", ownerId: auth.user.id } as const)
      : ({ id: auth.apiKey.id, kind: "api-key", ownerId: auth.project.ownerId } as const);
  setRequestFailureStage("rate_limit");
  const limit = await awaitWithSignal(() => checkRateLimit(req, identity), signal);
  if (limit.accountScoped) authorization = auth;
  if (!limit.success) {
    return { response: rateLimitExceeded(limit) };
  }

  return {
    authorization,
    user,
    oauthClientId: auth.kind === "personal_token" ? auth.oauthClientId : undefined,
  };
}

export async function handleMcpHttpRequest(req: Request) {
  const metadata = readMcpRequestMetadata(req);
  const id = metadata.then((value) => value.id);
  return withDeadline(req.signal, 260_000, (signal) =>
    withRequestFailureContext(req.signal, async () => {
      setRequestFailureMetadata(await metadata);
      let dispatched = false;
      try {
        const response = await withDeadline(signal, 30_000, async (preSignal) => {
          const context = requestFailureContext();
          if (context) context.signal = preSignal;
          const refused = requestRefusal(req);
          if (refused) return refused;
          const auth = await authenticateMcpRequest(req, preSignal);
          if ("response" in auth) return auth.response;
          setRequestFailureStage("client_gate");
          const minVersion = dshPluginMinVersion();
          const client = await awaitWithSignal(
            () => resolveMcpClient(req.headers, auth.oauthClientId, minVersion),
            preSignal,
          );
          recordMcpClient(client);
          if (minVersion && isBelowDshPluginFloor(client, minVersion)) {
            return updateRequiredResponse(req, client, minVersion, await id);
          }
          preSignal.throwIfAborted();
          setRequestFailureStage("server_create");
          const server = createBisibilityMcpServer({
            authorization: auth.authorization,
            activityUser: auth.user,
            clientHeader: req.headers.get("x-bisibility-client") ?? undefined,
          });
          const transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true,
            sessionIdGenerator: undefined,
          });
          setRequestFailureStage("server_connect");
          await awaitWithSignal(() => server.connect(transport), preSignal);
          return { transport };
        });
        const context = requestFailureContext();
        if (context) context.signal = signal;
        let result: Response;
        if (response instanceof Response) result = response;
        else {
          setRequestFailureStage("transport_handle");
          signal.throwIfAborted();
          dispatched = true;
          result = await awaitWithSignal(() => response.transport.handleRequest(req), signal);
        }
        setRequestFailureStage("response_encode");
        return await normalizeMcpFailure(result, await id, signal);
      } catch (error) {
        if (error instanceof ApiAuthError) {
          return normalizeMcpFailure(
            errorResponse("unauthorized", "Invalid bearer credential.", 401, {
              instance: instance(req),
            }),
            await id,
            AbortSignal.timeout(100),
          );
        }
        const status = req.signal.aborted
          ? 400
          : !dispatched && isTransientRequestFailure(error)
            ? 503
            : 500;
        if (status >= 500) reportRequestFailure(error, requestFailureContext()?.stage, status);
        return mcpFailureResponse(await id, status);
      }
    }),
  );
}

function requestRefusal(req: Request) {
  const method = req.method.toUpperCase();
  if (!methods.includes(method as (typeof methods)[number])) {
    return methodNotAllowed(methods, { instance: instance(req) });
  }
  if (hasInvalidOrigin(req)) {
    return errorResponse("forbidden", "The MCP request origin is not allowed.", 403, {
      instance: instance(req),
    });
  }

  return null;
}
