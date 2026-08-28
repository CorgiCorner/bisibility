import "server-only";

import { prisma } from "@/lib/db/prisma";

export type RevocableSession = {
  session: { id: string };
  user: { id: string };
};

/**
 * Drops every other session of the account so a credential change cannot leave a
 * stolen session signed in. Returns how many sessions were revoked.
 */
/** How many other sessions the account has right now; used for audit trails. */
export async function countOtherSessions(session: RevocableSession) {
  return prisma.session.count({
    where: { id: { not: session.session.id }, userId: session.user.id },
  });
}

export async function revokeOtherSessions(session: RevocableSession) {
  const { count } = await prisma.session.deleteMany({
    where: { id: { not: session.session.id }, userId: session.user.id },
  });

  return count;
}
