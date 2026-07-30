import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function getInviteByTokenHash(tokenHash: string) {
  return prisma.invite.findUnique({
    select: {
      acceptedAt: true,
      email: true,
      expiresAt: true,
      project: { select: { name: true } },
      role: true,
    },
    where: { token: tokenHash },
  });
}
