import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { assertEditableDemoAccountMutable } from "@/lib/demo/identity";
import type { RevokeConnectedAppOptions } from "@/lib/schemas/connected-app";
import { getAppCreatedTokens } from "./connected-app-tokens";
import { revokePersonalToken } from "./pat-service";

export async function revokeUserConnectedApp(
  userId: string,
  clientId: string,
  { revokeCreatedTokens }: RevokeConnectedAppOptions,
) {
  await assertEditableDemoAccountMutable(userId);
  return prisma.$transaction(async (tx) => {
    const where = { userId, clientId };
    let revokedCreatedTokenCount = 0;
    if (revokeCreatedTokens) {
      const tokens = await getAppCreatedTokens(userId, clientId, tx);
      for (const token of tokens) {
        if (await revokePersonalToken(userId, token.id, tx)) revokedCreatedTokenCount++;
      }
    }
    const consent = await tx.oauthConsent.deleteMany({ where });
    const refresh = await tx.oauthRefreshToken.updateMany({
      where: { ...where, revoked: null },
      data: { revoked: new Date() },
    });
    const access = await tx.oauthAccessToken.deleteMany({ where });
    if (consent.count || refresh.count || access.count || revokedCreatedTokenCount) {
      await writeAudit(
        {
          action: "account.connected_app_revoked",
          actorId: userId,
          targetType: "authorization",
          targetId: clientId,
          after: {
            clientId,
            deletedConsentCount: consent.count,
            revokedRefreshTokenCount: refresh.count,
            deletedAccessTokenCount: access.count,
            revokedCreatedTokenCount,
          },
        },
        tx,
      );
    }
    return { revoked: true as const, revokedCreatedTokenCount };
  });
}
