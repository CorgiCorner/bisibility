import "server-only";

import { createHash } from "node:crypto";
import { ApiAuthError, type PersonalTokenAuth } from "@/lib/api/auth";
import { errorResponse } from "@/lib/api/responses";
import { grantedApiScopes } from "@/lib/api/scope-policy";
import { AUTH_URL, AUTH_URL_CONFIGURED, MCP_RESOURCE_URL } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { protectedResourceMetadataUrl } from "@/lib/deployment/mcp-origin-contract";
import { logOauthValidationFailure } from "@/lib/mcp/oauth-validation-diagnostics";
import { verifyAccessToken } from "better-auth/oauth2";

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
  const rawToken = bearerToken(req);
  if (!rawToken) {
    return { response: unauthorized(req) };
  }

  const verificationOptions = oauthVerificationOptions();
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await verifyAccessToken(rawToken, verificationOptions);
  } catch (error) {
    logOauthValidationFailure(rawToken, error, {
      audience: verificationOptions.verifyOptions.audience,
      issuer: verificationOptions.verifyOptions.issuer,
    });
    return { response: unauthorized(req, "Invalid or expired OAuth access token.") };
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const scopes = grantedApiScopes(tokenScopes(payload));
  if (!userId || scopes.length === 0) {
    return { response: unauthorized(req, "Invalid OAuth access token claims.") };
  }

  const user = await prisma.user.findUnique({
    select: {
      deactivatedAt: true,
      email: true,
      id: true,
      memberships: { select: { projectId: true, role: true } },
      name: true,
      publicId: true,
    },
    where: { id: userId },
  });
  if (!user || user.deactivatedAt) {
    return { response: unauthorized(req, "Invalid or expired OAuth access token.") };
  }

  return {
    auth: {
      kind: "personal_token",
      memberships: user.memberships,
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
