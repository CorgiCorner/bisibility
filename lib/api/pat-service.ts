import "server-only";

import { randomBytes } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { hashApiKey } from "@/lib/providers/crypto";
import type { ApiKeyScope } from "@/lib/schemas/apiKey";
import { personalTokenAuditResource } from "./audit-resources";
import { scopesForTier } from "./key-scope";
import { requireApiPublicId } from "./public-id";

export { scopesForTier, tierFromScopes } from "./key-scope";

// Same shape as bsb_key_ project keys: 13-char namespace plus 24 random
// bytes, with eight random characters retained for indexed lookup.
export const PERSONAL_TOKEN_PREFIX_LENGTH = 21;

function newRawPersonalToken() {
  return `bsb_pat_live_${randomBytes(24).toString("base64url")}`;
}

export function maskIssuedToken(raw: string) {
  return `${raw.slice(0, PERSONAL_TOKEN_PREFIX_LENGTH)}******${raw.slice(-4)}`;
}

const tokenSelect = {
  createdAt: true,
  expiresAt: true,
  id: true,
  lastUsedAt: true,
  name: true,
  prefix: true,
  publicId: true,
  revokedAt: true,
  scopes: true,
} as const;

export type IssuePersonalTokenInput = {
  expiresInDays: number | null;
  name: string;
  scope: ApiKeyScope;
};

export async function issuePersonalToken(
  userId: string,
  input: IssuePersonalTokenInput,
  audit: { action?: "pat.exchange_login" | "pat.issue"; viaClientId?: string | null } = {},
) {
  const raw = newRawPersonalToken();
  const publicId = makePublicId("pat");
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const token = await prisma.personalAccessToken.create({
    data: {
      expiresAt,
      hashedKey: hashApiKey(raw),
      name: input.name,
      prefix: raw.slice(0, PERSONAL_TOKEN_PREFIX_LENGTH),
      publicId,
      scopes: scopesForTier(input.scope),
      userId,
    },
    select: tokenSelect,
  });

  await writeAudit({
    action: audit.action ?? "pat.issue",
    actorId: userId,
    after: personalTokenAuditResource(token),
    targetId: requireApiPublicId(token.publicId, "pat"),
    targetType: "personal_access_token",
  });

  return { ...token, maskedValue: maskIssuedToken(raw), raw };
}

export async function listPersonalTokens(userId: string) {
  return prisma.personalAccessToken.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    select: tokenSelect,
    where: { userId },
  });
}

export async function revokePersonalToken(userId: string, tokenId: string) {
  const before = await prisma.personalAccessToken.findFirst({
    select: tokenSelect,
    where: { publicId: tokenId, userId },
  });
  if (!before) {
    return null;
  }

  const token = await prisma.personalAccessToken.update({
    data: { revokedAt: before.revokedAt ?? new Date() },
    select: tokenSelect,
    where: { id: before.id },
  });

  await writeAudit({
    action: "pat.revoke",
    actorId: userId,
    after: personalTokenAuditResource(token),
    before: personalTokenAuditResource(before),
    targetId: requireApiPublicId(token.publicId, "pat"),
    targetType: "personal_access_token",
  });

  return token;
}
