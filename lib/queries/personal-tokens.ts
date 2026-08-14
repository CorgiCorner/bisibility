import "server-only";

import { listPersonalTokens, tierFromScopes } from "@/lib/api/pat-service";
import { parsePublicId } from "@/lib/db/public-id";

export type PersonalTokenData = {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  lastUsedAt: string | null;
  maskedValue: string;
  name: string;
  scope: "admin" | "read" | "write";
};

function requiredPublicId(value: string | null) {
  if (!value || parsePublicId(value)?.prefix !== "pat") {
    throw new Error("Personal access token public ID is not available.");
  }
  return value;
}

export async function getPersonalTokens(userId: string): Promise<PersonalTokenData[]> {
  const tokens = await listPersonalTokens(userId);

  return tokens
    .filter((token) => !token.revokedAt)
    .map((token) => ({
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt?.toISOString() ?? null,
      id: requiredPublicId(token.publicId),
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      maskedValue: `${token.prefix}******`,
      name: token.name,
      scope: tierFromScopes(token.scopes),
    }));
}
