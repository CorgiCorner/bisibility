import "server-only";

import { isPendingFirstRunUser } from "@/lib/auth/first-run-context";
import { addAuthPublicId } from "@/lib/auth/public-id-hooks";
import { assertTestAuthSession } from "@/lib/auth/test-auth-extension";
import { prisma } from "@/lib/db/prisma";
import { prepareDemoSessionCreation } from "@/lib/demo/session-policy";
import { APIError } from "better-auth/api";

type SessionCreationInput = { expiresAt: Date; userId: string };
export async function prepareSessionCreation(session: SessionCreationInput) {
  await assertTestAuthSession(session.userId);
  const demoSession = await prepareDemoSessionCreation(session);
  await preventDeactivatedSessionCreation(demoSession);
  return addAuthPublicId(demoSession, "sid");
}

// Throw instead of returning false because some provider routes would still set cookies.
// This hook runs after authentication, so an inactive identity can receive recovery guidance.
export async function preventDeactivatedSessionCreation(session: SessionCreationInput) {
  if (isPendingFirstRunUser(session.userId)) {
    return;
  }

  const user = await prisma.user.findUnique({
    select: { deactivatedAt: true },
    where: { id: session.userId },
  });

  if (!user || user.deactivatedAt) {
    throw new APIError("UNAUTHORIZED", {
      code: user?.deactivatedAt ? "ACCOUNT_DEACTIVATED" : "SESSION_CREATION_BLOCKED",
      message: "Unable to create session.",
    });
  }
}
