import "server-only";

import { requiredPublicAuditId } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { AuthSession } from "./session";
import { TwoFactorManagementError } from "./two-factor-management-error";
import type { TwoFactorSecurityContext } from "./two-factor-step-up";

export async function getTwoFactorSecurityContext(
  session: AuthSession,
): Promise<TwoFactorSecurityContext> {
  const [user, currentSession, credential] = await Promise.all([
    prisma.user.findUnique({
      select: { email: true, publicId: true, twoFactorEnabled: true },
      where: { id: session.user.id },
    }),
    prisma.session.findFirst({
      select: { createdAt: true, expiresAt: true },
      where: { id: session.session.id, userId: session.user.id },
    }),
    prisma.account.findFirst({
      select: { password: true },
      where: {
        password: { not: null },
        providerId: "credential",
        userId: session.user.id,
      },
    }),
  ]);

  if (!user || !currentSession || currentSession.expiresAt.getTime() <= Date.now()) {
    throw new TwoFactorManagementError(
      "unavailable",
      "The session is no longer active. Sign in again.",
    );
  }

  return {
    actorId: session.user.id,
    actorPublicId: requiredPublicAuditId(user.publicId, "usr", "User"),
    credentialPasswordHash: credential?.password ?? null,
    email: user.email,
    sessionCreatedAt: currentSession.createdAt,
    sessionId: session.session.id,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}
