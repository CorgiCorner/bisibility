import "server-only";

import type { Actor } from "@/lib/auth/authorize";
import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { handleAccountRequest } from "./account-router";
import { isAccountRoute, isPersonalTokenOnlyRoute } from "./account-routes";
import {
  type ApiAuth,
  ApiAuthError,
  type AuthenticatedApiKey,
  authenticateBearer,
  LEGACY_BEARER_PREFIXES,
  PERSONAL_TOKEN_PREFIX,
  PROJECT_API_KEY_PREFIX,
} from "./auth";
import type { ApiContext } from "./context";
import { capabilities, getHealth, getOpenApi, llmsText } from "./discovery";
import { errorFromUnknown } from "./error-mapper";
import { withIdempotency } from "./idempotency";
import { resolvePersonalProjectScope } from "./personal-scope";
import { getCostEstimate, getProviderRates } from "./public-cost";
import { checkRateLimit, rateLimitExceeded } from "./ratelimit";
import { isReadShapedProjectPostRoute } from "./read-shaped-post-routes";
import { hasScope, requiredScope } from "./request-scope";
import { errorResponse, methodNotAllowed } from "./responses";
import { dispatchRoute } from "./routes";

type RouteContext = {
  params?: Promise<{ path?: string[] }> | { path?: string[] };
};

type AuthResult = { auth: ApiAuth; headers: Headers } | { response: Response };
type AnonymousLimitResult = { headers: Headers } | { response: Response };

const methods = ["DELETE", "GET", "PATCH", "POST"] as const;

function instance(url: URL) {
  return `urn:bisibility:api:v1:${url.pathname}`;
}

async function pathFromContext(context?: RouteContext) {
  const params = await context?.params;
  return params?.path ?? [];
}

async function limitAnonymous(req: Request): Promise<AnonymousLimitResult> {
  const limit = await checkRateLimit(req, { kind: "anonymous" });
  return limit.success ? { headers: limit.headers } : { response: rateLimitExceeded(limit) };
}

async function requireAuth(req: Request): Promise<AuthResult> {
  try {
    const auth = await authenticateBearer(req);
    const identity =
      auth.kind === "personal_token"
        ? ({ id: auth.token.id, kind: "personal-token" } as const)
        : ({ id: auth.apiKey.id, kind: "api-key" } as const);
    const limit = await checkRateLimit(req, identity);
    return limit.success
      ? { auth, headers: limit.headers }
      : { response: rateLimitExceeded(limit) };
  } catch (error) {
    if (!(error instanceof ApiAuthError)) {
      throw error;
    }
    const limited = await limitAnonymous(req);
    if ("response" in limited) {
      return { response: limited.response };
    }

    return {
      response: errorResponse("unauthorized", error.message, 401, {
        headers: limited.headers,
        instance: instance(new URL(req.url)),
      }),
    };
  }
}

// An OAuth-authenticated POST /me/tokens is the PKCE login exchange for a
// long-lived personal access token.
function isOauthExchangeRequest(method: string, path: string[], req: Request) {
  if (method !== "POST" || path[0] !== "me" || path[1] !== "tokens" || path.length !== 2) {
    return false;
  }
  const header = req.headers.get("authorization")?.trim() ?? "";
  const token = header.replace(/^bearer\s+/i, "").trim();
  return (
    token.length > 0 &&
    !token.startsWith(PERSONAL_TOKEN_PREFIX) &&
    !token.startsWith(PROJECT_API_KEY_PREFIX) &&
    !LEGACY_BEARER_PREFIXES.some((prefix) => token.startsWith(prefix))
  );
}

function projectReadOnlyResponse(headers: Headers, url: URL) {
  return errorResponse("project_read_only", new ProjectReadOnlyError().message, 423, {
    headers,
    instance: instance(url),
  });
}

function isProjectCollectionCreate(method: string, path: string[]) {
  return method === "POST" && path[0] === "projects" && path.length === 1;
}

function projectCreateForbiddenResponse(headers: Headers, url: URL) {
  return errorResponse("forbidden", "Project-scoped API keys cannot create projects.", 403, {
    headers,
    instance: instance(url),
  });
}

function hasReadSemantics(method: string, path: string[]) {
  return method === "GET" || isReadShapedProjectPostRoute(method, path);
}

async function handleDiscovery(req: Request, path: string[]) {
  if (
    path.length !== 1 ||
    ![
      "capabilities",
      "cost-estimate",
      "health",
      "llms.txt",
      "openapi.json",
      "provider-rates",
    ].includes(path[0])
  ) {
    return null;
  }
  const limited = await limitAnonymous(req);
  if ("response" in limited) {
    return limited.response;
  }
  if (path[0] === "health") {
    return getHealth(limited);
  }
  if (path[0] === "openapi.json") {
    return getOpenApi(limited);
  }
  if (path[0] === "capabilities") {
    return capabilities(limited);
  }
  if (path[0] === "provider-rates") {
    return getProviderRates(limited);
  }
  if (path[0] === "cost-estimate") {
    return getCostEstimate(req, limited);
  }
  return llmsText(limited);
}

export async function handleApiRequest(req: Request, contextOrPath?: RouteContext | string[]) {
  const path = Array.isArray(contextOrPath) ? contextOrPath : await pathFromContext(contextOrPath);
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  if (!methods.includes(method as (typeof methods)[number])) {
    return methodNotAllowed(methods, { instance: instance(url) });
  }
  if (method === "GET") {
    const discovery = await handleDiscovery(req, path);
    if (discovery) {
      return discovery;
    }
  }
  if (isOauthExchangeRequest(method, path, req)) {
    const limited = await limitAnonymous(req);
    if ("response" in limited) {
      return limited.response;
    }
    return import("./tokens").then((routes) =>
      routes.exchangeOauthToken(req, url, { headers: limited.headers, instance: instance(url) }),
    );
  }

  const authResult = await requireAuth(req);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { auth } = authResult;
  if (auth.kind === "project_key" && isPersonalTokenOnlyRoute(path)) {
    return errorResponse("not_found", "This route requires a personal access token.", 404, {
      headers: authResult.headers,
      instance: instance(url),
    });
  }
  if (method === "GET" && path[0] === "locations" && path[1] === "search" && path.length === 2) {
    const scopes = auth.kind === "personal_token" ? auth.token.scopes : auth.apiKey.scopes;
    if (!hasScope(scopes, "read")) {
      return errorResponse("forbidden", "API key scope does not allow this operation.", 403, {
        headers: authResult.headers,
        instance: instance(url),
      });
    }
    try {
      return await import("./locations").then((routes) =>
        routes.searchApiLocations({ headers: authResult.headers, url }),
      );
    } catch (error) {
      return errorFromUnknown(error, authResult.headers, url);
    }
  }
  let actorId: string | null = null;
  let actor: Actor;
  let projectAuth: AuthenticatedApiKey;

  if (auth.kind === "personal_token") {
    actorId = auth.user.id;
    if (isAccountRoute(path)) {
      return handleAccountRequest({
        allowed: hasScope(auth.token.scopes, requiredScope(method, path)),
        auth,
        headers: authResult.headers,
        method,
        path,
        req,
        url,
      });
    }
    const resolved = await resolvePersonalProjectScope(req, url, path, auth, {
      headers: authResult.headers,
      instance: instance(url),
    });
    if ("response" in resolved) {
      return resolved.response;
    }
    if (
      method === "DELETE" &&
      path[0] === "projects" &&
      path.length === 2 &&
      resolved.role !== "owner"
    ) {
      return errorResponse("forbidden", "Only the project owner can delete a project.", 403, {
        headers: authResult.headers,
        instance: instance(url),
      });
    }
    projectAuth = resolved.auth;
    actor = {
      id: auth.user.id,
      memberships: [{ projectId: resolved.auth.project.id, role: resolved.role }],
    };
  } else {
    projectAuth = auth;
    actor = {
      id: auth.project.ownerId ?? auth.apiKey.id,
      memberships: [{ projectId: auth.project.id, role: "owner" }],
    };
  }

  if (!hasScope(projectAuth.apiKey.scopes, requiredScope(method, path))) {
    return errorResponse("forbidden", "API key scope does not allow this operation.", 403, {
      headers: authResult.headers,
      instance: instance(url),
    });
  }
  if (auth.kind === "project_key" && isProjectCollectionCreate(method, path)) {
    return projectCreateForbiddenResponse(authResult.headers, url);
  }
  if (!hasReadSemantics(method, path) && isProjectReadOnly(projectAuth.project.writeMode)) {
    return projectReadOnlyResponse(authResult.headers, url);
  }

  const ctx: ApiContext = {
    actor,
    actorId,
    auth: projectAuth,
    headers: authResult.headers,
    instance: instance(url),
    method,
    path,
    req,
    url,
  };
  const execute = async () => {
    try {
      const response = await dispatchRoute(ctx);
      return (
        response ??
        errorResponse("not_found", "Route not found.", 404, {
          headers: ctx.headers,
          instance: ctx.instance,
        })
      );
    } catch (error) {
      return errorFromUnknown(error, ctx.headers, url);
    }
  };

  return method === "GET"
    ? execute()
    : withIdempotency(
        {
          apiKeyId: projectAuth.apiKey.id,
          headers: authResult.headers,
          method,
          pathname: url.pathname,
          req,
        },
        execute,
      );
}
