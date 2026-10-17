import "server-only";

import { AuthorizationError } from "@/lib/auth/authorize";
import {
  loginErrorReturnTo,
  RETURN_TO_REQUEST_HEADER,
  validateReturnTo,
} from "@/lib/auth/return-to";
import { retryTransientSessionDatabaseRead } from "@/lib/auth/session-retry";
import { assertTestAuthSession } from "@/lib/auth/test-auth-extension";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { loadConfiguredDemoActor } from "@/lib/demo/identity";
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

export class SessionReadUnavailableError extends Error {
  constructor() {
    super("Session availability could not be confirmed.");
    this.name = "SessionReadUnavailableError";
  }
}

async function readSessionReference(requireAvailability = false) {
  const requestHeaders = await headers();
  const { auth } = await import("@/lib/auth/auth");
  const resolved = await retryTransientSessionDatabaseRead(() =>
    auth.api.getSession({ headers: requestHeaders }),
  );
  if (!resolved.ok) {
    if (requireAvailability) throw new SessionReadUnavailableError();
    return null;
  }

  return resolved.value;
}

// A reference alone is not active authorization; callers must revalidate the account.
export const getSessionReference = perRequestCache(() => readSessionReference());

const getAvailableSession = perRequestCache(async () =>
  enforceActiveSession(await readSessionReference(true), true),
);

export const getOptionalAvailableSession = getAvailableSession;

export const getSession = perRequestCache(async () => {
  return enforceActiveSession(await getSessionReference());
});

// Cookie-cached sessions can outlive an account-state change for up to 60 seconds. Keep this
// database check as defense in depth even though deactivation normally deletes all sessions.
export async function enforceActiveSession<T extends { user: { id: string } }>(
  session: T | null,
  requireAvailability = false,
): Promise<T | null> {
  if (!session) {
    return null;
  }

  try {
    await assertTestAuthSession(session.user.id);
  } catch (error) {
    if (requireAvailability) throw error;
    return null;
  }

  if (readDemoConfig().kind !== "disabled") {
    return (await loadConfiguredDemoActor(session.user.id)) ? session : null;
  }

  const resolved = await retryTransientSessionDatabaseRead(() =>
    prisma.user.findUnique({
      select: { deactivatedAt: true },
      where: { id: session.user.id },
    }),
  );
  if (!resolved.ok) {
    if (requireAvailability) throw new SessionReadUnavailableError();
    return null;
  }
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

async function requireResolvedSession(read: typeof getSession) {
  await connection();
  const session = await read();

  if (!session) {
    const returnTo = validateReturnTo((await headers()).get(RETURN_TO_REQUEST_HEADER));
    redirect(returnTo ? loginErrorReturnTo(returnTo) : "/login");
  }

  return session;
}

export async function requireSession() {
  return requireResolvedSession(getSession);
}

// SSE must distinguish unavailable authorization reads from a confirmed missing session.
export async function requireAvailableSession() {
  return requireResolvedSession(getAvailableSession);
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
