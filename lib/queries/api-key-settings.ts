import type { Prisma } from "@/lib/generated/prisma/client";

type DateFormatter = { formatDate: (date: Date) => string };

export function activeApiKeyWhere(now: Date): Prisma.ApiKeyWhereInput {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    revokedAt: null,
  };
}

export function apiKeyExpiryLabel(expiresAt: Date | null, now: Date, dateTime: DateFormatter) {
  if (!expiresAt) return "never expires";
  return `${expiresAt <= now ? "expired" : "expires"} ${dateTime.formatDate(expiresAt)}`;
}
