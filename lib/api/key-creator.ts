import type { Role } from "@/lib/generated/prisma/client";
import { effectiveScopes } from "./personal-scope";
import { type ApiScope, parseStoredApiScopes, scopesForTier, tierFromScopes } from "./scope-policy";

/**
 * Stored key scopes cut down to what the creator's current role allows, with the same
 * role-to-tier mapping as personal tokens. No role (the creator left the project or the
 * account is gone) means no rights at all.
 */
export function capApiScopesToRole(
  scopes: readonly ApiScope[],
  role: Role | null | undefined,
): readonly ApiScope[] {
  if (!role) return [];
  const capped = effectiveScopes(scopes, role);
  // Within the ceiling the stored scopes stay exactly as they were.
  return tierFromScopes(capped) === tierFromScopes(scopes) ? scopes : capped;
}

/** True when a new key of this tier stays within the creator's current role. */
export function apiKeyTierAllowedForRole(tier: ApiScope, role: Role | null | undefined) {
  const wanted = scopesForTier(tier);
  return capApiScopesToRole(wanted, role).length === wanted.length;
}

export type MembershipReader = {
  membership: {
    findUnique(input: {
      where: { userId_projectId: { userId: string; projectId: string } };
      select: { role: true };
    }): Promise<{ role: Role } | null>;
  };
};

/**
 * Read the creator's current project role once for both scope and action authorization.
 */
export async function effectiveApiKeyAccess(
  db: MembershipReader,
  key: { scopes: unknown; createdById: string | null; projectId: string },
) {
  const scopes = parseStoredApiScopes(key.scopes);
  if (!scopes) return null;
  if (!key.createdById) return { creatorRole: null, scopes: [] };
  const membership = await db.membership.findUnique({
    where: { userId_projectId: { userId: key.createdById, projectId: key.projectId } },
    select: { role: true },
  });
  const creatorRole = membership?.role ?? null;
  return { creatorRole, scopes: capApiScopesToRole(scopes, creatorRole) };
}

export async function effectiveApiKeyScopes(
  db: MembershipReader,
  key: Parameters<typeof effectiveApiKeyAccess>[1],
): Promise<readonly ApiScope[] | null> {
  return (await effectiveApiKeyAccess(db, key))?.scopes ?? null;
}

/** Owner-only actions require a personal credential. */
export function projectApiKeyRole(creatorRole: Role): Exclude<Role, "owner"> {
  return creatorRole === "owner" ? "admin" : creatorRole;
}

/** Effective scopes of a key that is neither revoked nor expired; null otherwise, before any role read. */
export async function liveApiKeyScopes(
  db: MembershipReader,
  key: {
    scopes: unknown;
    createdById: string | null;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null,
  now = new Date(),
): Promise<readonly ApiScope[] | null> {
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now)) return null;
  return effectiveApiKeyScopes(db, key);
}
