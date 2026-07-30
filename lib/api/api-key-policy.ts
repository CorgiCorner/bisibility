export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;

export type ApiKeyExpiryDays = (typeof API_KEY_EXPIRY_DAYS)[number] | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveApiKeyExpiry(expiresInDays: ApiKeyExpiryDays, now = new Date()) {
  return expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * DAY_MS);
}

export function inheritedApiKeyExpiry(createdAt: Date, expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) return { expiresAt: null, expiresInDays: null };

  const durationDays = Math.round((expiresAt.getTime() - createdAt.getTime()) / DAY_MS);
  const expiresInDays = API_KEY_EXPIRY_DAYS.reduce((nearest, days) =>
    Math.abs(days - durationDays) < Math.abs(nearest - durationDays) ? days : nearest,
  );
  return {
    expiresAt: resolveApiKeyExpiry(expiresInDays, now),
    expiresInDays,
  };
}
