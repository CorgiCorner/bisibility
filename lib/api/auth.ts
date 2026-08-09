import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/generated/prisma/client";
import { verifyApiKey } from "@/lib/providers/crypto";
import { type ApiScope, isApiScope, scopesForTier } from "./scope-policy";

const API_KEY_PREFIX_LENGTH = 21;

export const PROJECT_API_KEY_PREFIX = "bsb_key_";
export const PERSONAL_TOKEN_PREFIX = "bsb_pat_live_";
export const LEGACY_BEARER_PREFIXES = ["bsk_", "bsp_"] as const;

export type { ApiScope } from "./scope-policy";

function resolveApiKeyScopes(apiKey: { scopes?: unknown }): readonly ApiScope[] {
  if (!Array.isArray(apiKey.scopes)) {
    return scopesForTier("admin");
  }
  const scopes = apiKey.scopes.filter(isApiScope);
  return scopes.length ? scopes : scopesForTier("admin");
}

export class ApiAuthError extends Error {
  readonly code = "unauthorized";
  readonly status = 401;

  constructor(message = "Invalid API key.") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export type AuthenticatedApiKey = {
  apiKey: {
    id: string;
    name: string;
    prefix: string;
    projectId: string;
    scopes: readonly ApiScope[];
  };
  project: {
    createdAt: Date;
    domain: string | null;
    id: string;
    name: string;
    ownerId?: string;
    publicId: string;
    updatedAt: Date;
    writeMode?: string;
  };
};

export type ProjectKeyAuth = AuthenticatedApiKey & { kind: "project_key" };

export type MembershipFact = { projectId: string; role: Role };

export type PersonalTokenAuth = {
  kind: "personal_token";
  memberships: readonly MembershipFact[];
  token: {
    id: string;
    name: string;
    prefix: string;
    publicId: string | null;
    scopes: readonly ApiScope[];
    userId: string;
  };
  user: {
    email: string;
    id: string;
    name: string;
    publicId: string | null;
  };
};

export type ApiAuth = PersonalTokenAuth | ProjectKeyAuth;

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

// Personal tokens always store the cumulative tier array; fall back to the
// least-privileged tier instead of ApiKey's permissive legacy default.
function resolvePersonalTokenScopes(token: { scopes?: unknown }): readonly ApiScope[] {
  if (!Array.isArray(token.scopes)) {
    return scopesForTier("read");
  }
  const scopes = token.scopes.filter(isApiScope);
  return scopes.length ? scopes : scopesForTier("read");
}

async function authenticatePersonalToken(rawKey: string): Promise<PersonalTokenAuth> {
  const candidates = await prisma.personalAccessToken.findMany({
    select: {
      expiresAt: true,
      hashedKey: true,
      id: true,
      name: true,
      prefix: true,
      publicId: true,
      revokedAt: true,
      scopes: true,
      user: {
        select: {
          email: true,
          id: true,
          memberships: { select: { projectId: true, role: true } },
          name: true,
          publicId: true,
        },
      },
      userId: true,
    },
    take: 10,
    where: { prefix: rawKey.slice(0, API_KEY_PREFIX_LENGTH) },
  });
  const token = candidates.find((candidate) => verifyApiKey(rawKey, candidate.hashedKey));

  if (!token || token.revokedAt) {
    throw new ApiAuthError();
  }
  if (token.expiresAt && token.expiresAt <= new Date()) {
    throw new ApiAuthError("Personal access token has expired.");
  }

  await prisma.personalAccessToken.update({
    data: { lastUsedAt: new Date() },
    select: { id: true },
    where: { id: token.id },
  });

  return {
    kind: "personal_token",
    memberships: token.user.memberships,
    token: {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      publicId: token.publicId,
      scopes: resolvePersonalTokenScopes(token),
      userId: token.userId,
    },
    user: {
      email: token.user.email,
      id: token.user.id,
      name: token.user.name,
      publicId: token.user.publicId,
    },
  };
}

export async function authenticateBearer(req: Request): Promise<ApiAuth> {
  const rawKey = bearerToken(req);
  if (rawKey.startsWith(PERSONAL_TOKEN_PREFIX)) {
    return authenticatePersonalToken(rawKey);
  }

  return { kind: "project_key", ...(await authenticateApiKey(req)) };
}

export async function authenticateApiKey(req: Request): Promise<AuthenticatedApiKey> {
  const rawKey = bearerToken(req);
  if (!rawKey.startsWith(PROJECT_API_KEY_PREFIX)) {
    throw new ApiAuthError();
  }
  const candidates = await prisma.apiKey.findMany({
    select: {
      expiresAt: true,
      hashedKey: true,
      id: true,
      name: true,
      prefix: true,
      project: {
        select: {
          createdAt: true,
          domain: true,
          id: true,
          name: true,
          ownerId: true,
          publicId: true,
          updatedAt: true,
          writeMode: true,
        },
      },
      projectId: true,
      revokedAt: true,
      scopes: true,
    },
    take: 10,
    where: { prefix: rawKey.slice(0, API_KEY_PREFIX_LENGTH) },
  });
  const apiKey = candidates.find((candidate) => verifyApiKey(rawKey, candidate.hashedKey));

  if (!apiKey || apiKey.revokedAt) {
    throw new ApiAuthError();
  }
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    throw new ApiAuthError("API key has expired.");
  }

  await prisma.apiKey.update({
    data: { lastUsedAt: new Date() },
    select: { id: true },
    where: { id: apiKey.id },
  });

  return {
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      projectId: apiKey.projectId,
      scopes: resolveApiKeyScopes(apiKey),
    },
    project: apiKey.project,
  };
}
