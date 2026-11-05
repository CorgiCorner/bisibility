import "server-only";

import { createHash } from "node:crypto";
import { ApiAuthError, type PersonalTokenAuth } from "@/lib/api/auth";
import { errorResponse } from "@/lib/api/responses";
import { grantedApiScopes } from "@/lib/api/scope-policy";
import { awaitWithSignal } from "@/lib/async/abort";
import { AUTH_URL, AUTH_URL_CONFIGURED, MCP_RESOURCE_URL } from "@/lib/auth/auth";
import { allowedOAuthTokenScopes } from "@/lib/auth/oauth-consent-guard";
import { isFirstPartyApiOAuthClient } from "@/lib/auth/oauth-policy";
import { prisma } from "@/lib/db/prisma";
import { protectedResourceMetadataUrl } from "@/lib/deployment/mcp-origin-contract";
import {
  reportRequestFailure,
  requestFailureContext,
  setRequestFailureStage,
} from "@/lib/observability/request-failure";
import { verifyAccessToken } from "better-auth/oauth2";
import { APIError } from "better-call";

type OAuthAuthentication = { auth: PersonalTokenAuth } | { response: Response };

function bearerToken(req: Request) {
  const header = req.headers.get("authorization");
  const [scheme, token, extra] = header?.trim().split(/\s+/) ?? [];
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

function oauthChallenge() {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl(MCP_RESOURCE_URL)}"`;
}

function unauthorized(req: Request, detail = "A bearer credential is required.") {
  const headers = new Headers({ "WWW-Authenticate": oauthChallenge() });
  return errorResponse("unauthorized", detail, 401, {
    headers,
    instance: `urn:bisibility:mcp:${new URL(req.url).pathname}`,
  });
}

function tokenScopes(payload: unknown) {
  const scope = (payload as { scope?: unknown }).scope;
  if (Array.isArray(scope)) {
    return scope.filter((value): value is string => typeof value === "string");
  }
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
}

function oauthClientId(payload: unknown) {
  const claims = payload as { azp?: unknown; client_id?: unknown };
  if (typeof claims.client_id === "string" && claims.client_id.length > 0) {
    return claims.client_id;
  }
  if (typeof claims.azp === "string" && claims.azp.length > 0) {
    return claims.azp;
  }
  return null;
}

function oauthVerificationOptions() {
  if (!AUTH_URL_CONFIGURED) {
    throw new Error("MCP OAuth token verification requires BETTER_AUTH_URL to be configured.");
  }

  return {
    jwksUrl: new URL("/api/auth/jwks", AUTH_URL).toString(),
    verifyOptions: { audience: MCP_RESOURCE_URL, issuer: AUTH_URL },
  };
}

export async function authenticateMcpOAuthRequest(req: Request): Promise<OAuthAuthentication> {
  const signal = requestFailureContext()?.signal;
  const rawToken = bearerToken(req);
  if (!rawToken) {
    return { response: unauthorized(req) };
  }

  setRequestFailureStage("oauth_verify");
  const verificationOptions = oauthVerificationOptions();
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await awaitWithSignal(() => verifyAccessToken(rawToken, verificationOptions), signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) {
      return { response: unauthorized(req, "Invalid or expired OAuth access token.") };
    }
    reportRequestFailure(error, "oauth_verify", 503);
    return {
      response: errorResponse(
        "internal_server_error",
        "OAuth token verification is unavailable. Check the authentication server configuration and availability.",
        503,
        { instance: `urn:bisibility:mcp:${new URL(req.url).pathname}` },
      ),
    };
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const clientId = oauthClientId(payload);
  signal?.throwIfAborted();
  setRequestFailureStage("oauth_scope");
  // App grants belong to /api/v1 only (ADR-021); `api:*` never maps to MCP scopes either.
  const scopes = isFirstPartyApiOAuthClient(clientId)
    ? []
    : grantedApiScopes(
        await awaitWithSignal(
          () => allowedOAuthTokenScopes(clientId, tokenScopes(payload)),
          signal,
        ),
      );
  if (!userId || scopes.length === 0) {
    return { response: unauthorized(req, "Invalid OAuth access token claims.") };
  }

  setRequestFailureStage("user_lookup");
  const user = await awaitWithSignal(
    () =>
      prisma.user.findUnique({
        select: {
          deactivatedAt: true,
          email: true,
          id: true,
          memberships: { select: { projectId: true, role: true } },
          name: true,
          publicId: true,
        },
        where: { id: userId },
      }),
    signal,
  );
  if (!user || user.deactivatedAt) {
    return { response: unauthorized(req, "Invalid or expired OAuth access token.") };
  }

  return {
    auth: {
      kind: "personal_token",
      memberships: user.memberships,
      oauthClientId: clientId ?? "oauth",
      token: {
        id: `oauth:${createHash("sha256").update(rawToken).digest("hex").slice(0, 32)}`,
        name: "MCP OAuth",
        prefix: "oauth",
        publicId: null,
        scopes,
        userId: user.id,
      },
      user: {
        email: user.email,
        id: user.id,
        name: user.name,
        publicId: user.publicId,
      },
    },
  };
}

export function isApiCredential(token: string) {
  return token.startsWith("bsb_key_") || token.startsWith("bsb_pat_live_");
}

export function requireBearerToken(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new ApiAuthError("A bearer credential is required.");
  return token;
}
