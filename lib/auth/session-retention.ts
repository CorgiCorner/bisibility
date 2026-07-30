import "server-only";

import { prisma } from "@/lib/db/prisma";

export type PurgeExpiredSessionsInput = {
  now?: Date;
  includeVerifications?: boolean;
};

export type PurgeExpiredSessionsSummary = {
  cutoff: Date;
  sessionsDeleted: number;
  verificationsDeleted: number;
};

export async function purgeExpiredSessions({
  now = new Date(),
  includeVerifications = true,
}: PurgeExpiredSessionsInput = {}): Promise<PurgeExpiredSessionsSummary> {
  const cutoff = now;
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } });

  let verificationsDeleted = 0;
  if (includeVerifications) {
    const verifications = await prisma.verification.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    verificationsDeleted = verifications.count;
  }

  return {
    cutoff,
    sessionsDeleted: sessions.count,
    verificationsDeleted,
  };
}
