import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

export class RecoveryAuthorizationError extends Error {
  constructor() {
    super("Administrator access required");
  }
}

/** The row lock also excludes concurrent role revocation during a commit. */
export async function assertRecoveryAdmin(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id=${actorId} FOR SHARE`;
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { isInstanceAdmin: true, deactivatedAt: true },
  });
  if (!actor?.isInstanceAdmin || actor.deactivatedAt) throw new RecoveryAuthorizationError();
}
