import "server-only";

import { createHash } from "node:crypto";
import { isFirstPartyApiOAuthClient } from "@/lib/auth/oauth-policy";
import { prisma } from "@/lib/db/prisma";
import type { PersonalTokenAuth } from "./auth";
import { firstPartyAppApiScopes } from "./scope-policy";

/**
 * ADR-021: `/api/v1` accepts OAuth access tokens only in their opaque form and only from a
 * first-party app client. JWT access tokens (the MCP audience) never qualify, so the provider's
 * cross-audience advisory cannot reach this API. Returns null for every rejected token.
 */
const OPAQUE_ACCESS_TOKEN = /^[A-Za-z0-9_-]{20,256}$/;

// The OAuth provider stores opaque tokens as SHA-256 base64url digests.
function hashOpaqueToken(raw: string) {
  return createHash("sha256").update(raw).digest("base64url");
}

export function isOpaqueOAuthAccessToken(raw: string) {
  return OPAQUE_ACCESS_TOKEN.test(raw);
}

export async function authenticateAppOAuthToken(raw: string): Promise<PersonalTokenAuth | null> {
  if (!isOpaqueOAuthAccessToken(raw)) return null;
  const row = await prisma.oauthAccessToken.findUnique({
    select: {
      client: { select: { disabled: true } },
      clientId: true,
      expiresAt: true,
      refreshToken: { select: { authTime: true } },
      scopes: true,
      user: {
        select: {
          deactivatedAt: true,
          email: true,
          id: true,
          memberships: { select: { projectId: true, role: true } },
          name: true,
          publicId: true,
        },
      },
    },
    where: { token: hashOpaqueToken(raw) },
  });
  if (!row?.user || row.user.deactivatedAt) return null;
  if (!isFirstPartyApiOAuthClient(row.clientId) || row.client.disabled) return null;
  if (row.expiresAt <= new Date()) return null;
  const scopes = firstPartyAppApiScopes(row.scopes);
  if (scopes.length === 0) return null;

  const { user } = row;
  return {
    authTime: row.refreshToken?.authTime ?? null,
    kind: "personal_token",
    memberships: user.memberships,
    oauthClientId: row.clientId,
    token: {
      // One rate-limit and audit identity per app grant, stable across token rotation.
      id: `oauth:${row.clientId}:${user.id}`,
      name: "Bisibility app",
      prefix: "oauth",
      publicId: null,
      scopes,
      userId: user.id,
    },
    user: { email: user.email, id: user.id, name: user.name, publicId: user.publicId },
  };
}
