import "server-only";

import { tokenSchema } from "./schemas";

export function bearerMigrationToken(header: string | null) {
  if (!header) return null;
  return /^Bearer ([^\s]+)$/.exec(header)?.[1] ?? null;
}

export function parseMigrationToken(value: string | null | undefined) {
  return tokenSchema.safeParse(value);
}
