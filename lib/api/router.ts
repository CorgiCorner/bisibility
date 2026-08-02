import "server-only";

import type { Actor } from "@/lib/auth/authorize";
import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { handleAccountRequest } from "./account-router";
import { isAccountRoute, isPersonalTokenOnlyRoute } from "./account-routes";
import { unsupportedApiVersionResponse } from "./api-versions";
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
import { handleDiscovery } from "./discovery-router";
import { errorFromUnknown } from "./error-mapper";
import { withIdempotency } from "./idempotency";
import { operationPolicyForRequest } from "./operation-policy";
import { resolvePersonalProjectScope } from "./personal-scope";
import { checkRateLimit, rateLimitExceeded } from "./ratelimit";
import { hasScope } from "./request-scope";
import { errorResponse, methodNotAllowed, routeNotFound } from "./responses";
import { dispatchRoute } from "./routes";

type RouteContext = {
  params?: Promise<{ path?: string[] }> | { path?: string[] };
};

type AuthResult = { auth: ApiAuth; headers: Headers } | { response: Response };
type PreauthenticatedApiRequest = { auth: ApiAuth; headers?: Headers };
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

async function dispatchApiRequest(
  req: Request,
  contextOrPath?: RouteContext | string[],
  preauthenticated?: PreauthenticatedApiRequest,
) {
  const path = Array.isArray(contextOrPath) ? contextOrPath : await pathFromContext(contextOrPath);
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const versionError = unsupportedApiVersionResponse(req);
  if (versionError) return versionError;
  if (!methods.includes(method as (typeof methods)[number])) {
    return methodNotAllowed(methods, { instance: instance(url) });
  }
  if (method === "GET") {
    const discovery = await handleDiscovery(req, path, preauthenticated !== undefined);
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
  const declaredOperation = operationPolicyForRequest(method, path);

  const authResult = preauthenticated
    ? { auth: preauthenticated.auth, headers: preauthenticated.headers ?? new Headers() }
    : await requireAuth(req);
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
  if (!declaredOperation) {
    return routeNotFound({ headers: authResult.headers, instance: instance(url) });
  }
  if (method === "GET" && path[0] === "locations" && path[1] === "search" && path.length === 2) {
    const scopes = auth.kind === "personal_token" ? auth.token.scopes : auth.apiKey.scopes;
    if (!hasScope(scopes, declaredOperation.requiredScope)) {
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
        allowed: hasScope(auth.token.scopes, declaredOperation.requiredScope),
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

  if (!hasScope(projectAuth.apiKey.scopes, declaredOperation.requiredScope)) {
    return errorResponse("forbidden", "API key scope does not allow this operation.", 403, {
      headers: authResult.headers,
      instance: instance(url),
    });
  }
  if (auth.kind === "project_key" && isProjectCollectionCreate(method, path)) {
    return projectCreateForbiddenResponse(authResult.headers, url);
  }
  if (
    declaredOperation.projectAccess === "write" &&
    isProjectReadOnly(projectAuth.project.writeMode)
  ) {
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
      return response ?? routeNotFound({ headers: ctx.headers, instance: ctx.instance });
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

export function handleApiRequest(req: Request, contextOrPath?: RouteContext | string[]) {
  return dispatchApiRequest(req, contextOrPath);
}

export function handleMcpPreauthenticatedApiRequest(
  req: Request,
  path: string[],
  preauthenticated: PreauthenticatedApiRequest,
) {
  return dispatchApiRequest(req, path, preauthenticated);
}
