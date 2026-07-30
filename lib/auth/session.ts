import "server-only";

import { auth } from "@/lib/auth/auth";
import { AuthorizationError } from "@/lib/auth/authorize";
import {
  loginErrorReturnTo,
  RETURN_TO_REQUEST_HEADER,
  validateReturnTo,
} from "@/lib/auth/return-to";
import { retryTransientSessionDatabaseRead } from "@/lib/auth/session-retry";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/generated/prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

const roleRank = {
  viewer: 0,
  auditor: 0.5,
  member: 1,
  admin: 2,
  owner: 3,
} satisfies Record<Role, number>;

// Collapse repeated RSC session reads per request; plain runtimes use identity so
// the auth layer remains importable in tests.
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

// This distinguishes missing sessions from stale account references for UI only;
// authorization must revalidate the referenced user.
export const getSessionReference = perRequestCache(async () => {
  const requestHeaders = await headers();
  const resolved = await retryTransientSessionDatabaseRead(() =>
    auth.api.getSession({ headers: requestHeaders }),
  );
  if (!resolved.ok) return null;

  return resolved.value;
});

export const getSession = perRequestCache(async () => {
  return enforceActiveSession(await getSessionReference());
});

// Cookie-cached sessions can outlive an account-state change for up to 60 seconds. Keep this
// database check as defense in depth even though deactivation normally deletes all sessions.
export async function enforceActiveSession<T extends { user: { id: string } }>(
  session: T | null,
): Promise<T | null> {
  if (!session) {
    return null;
  }

  const resolved = await retryTransientSessionDatabaseRead(() =>
    prisma.user.findUnique({
      select: { deactivatedAt: true },
      where: { id: session.user.id },
    }),
  );
  if (!resolved.ok) return null;
  const user = resolved.value;
  if (user?.deactivatedAt === null) {
    return session;
  }

  if (user?.deactivatedAt) {
    try {
      await prisma.session.deleteMany({
        where: {
          user: { is: { deactivatedAt: { not: null } } },
          userId: session.user.id,
        },
      });
    } catch {
      console.error("[auth] Failed to clean up sessions for a deactivated account.");
    }
  }

  return null;
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession() {
  await connection();
  const session = await getSession();

  if (!session) {
    const returnTo = validateReturnTo((await headers()).get(RETURN_TO_REQUEST_HEADER));
    redirect(returnTo ? loginErrorReturnTo(returnTo) : "/login");
  }

  return session;
}

export async function requireRole(role: Role) {
  // Checks global User.role only; do not wire into project routes, use authorize/requireProjectScope.
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || roleRank[user.role] < roleRank[role]) {
    throw new AuthorizationError("forbidden", `Requires ${role} role.`);
  }

  return {
    ...session,
    user: {
      ...session.user,
      role: user.role,
    },
  };
}
