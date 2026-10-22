import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AppCreatedToken } from "@/lib/schemas/connected-app";

type TokenReader = Pick<Prisma.TransactionClient, "auditLog" | "personalAccessToken">;

// Only an explicit successful issuance receipt proves origin. Older receipts lack it;
// audit retention can also remove it. Never infer origin from a token's name.
export async function getAppCreatedTokens(
  userId: string,
  clientId: string,
  client: TokenReader = prisma,
): Promise<AppCreatedToken[]> {
  const receipts = await client.auditLog.findMany({
    where: {
      actorId: userId,
      action: "pat.exchange_login",
      status: "success",
      targetType: "personal_access_token",
      after: { path: ["viaClientId"], equals: clientId },
    },
    select: { targetId: true },
  });
  if (!receipts.length) return [];
  const tokens = await client.personalAccessToken.findMany({
    where: {
      userId,
      publicId: { in: [...new Set(receipts.map((receipt) => receipt.targetId))] },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { publicId: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  return tokens.map((token) => ({ id: token.publicId, name: token.name }));
}
