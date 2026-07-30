import "server-only";

import { listPersonalTokens, tierFromScopes } from "@/lib/api/pat-service";
import { parsePublicId } from "@/lib/db/public-id";
import { createUserDateTimeFormatter, type DateTimePreferences } from "@/lib/format/user-datetime";

export type PersonalTokenData = {
  createdLabel: string;
  expiresLabel: string;
  id: string;
  lastUsedLabel: string;
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

export async function getPersonalTokens(
  userId: string,
  options: { preferences?: Partial<DateTimePreferences> } = {},
): Promise<PersonalTokenData[]> {
  const dateTime = createUserDateTimeFormatter(options.preferences);
  const tokens = await listPersonalTokens(userId);

  return tokens
    .filter((token) => !token.revokedAt)
    .map((token) => {
      let expiresLabel = "never expires";
      if (token.expiresAt) {
        const prefix = token.expiresAt <= new Date() ? "expired" : "expires";
        expiresLabel = `${prefix} ${dateTime.formatDate(token.expiresAt)}`;
      }
      return {
        createdLabel: `created ${dateTime.formatDate(token.createdAt)}`,
        expiresLabel,
        id: requiredPublicId(token.publicId),
        lastUsedLabel: token.lastUsedAt
          ? `last used ${dateTime.formatDate(token.lastUsedAt)}`
          : "never used",
        maskedValue: `${token.prefix}******`,
        name: token.name,
        scope: tierFromScopes(token.scopes),
      };
    });
}
