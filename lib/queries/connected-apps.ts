import "server-only";

import { getAppCreatedTokens } from "@/lib/api/connected-app-tokens";
import { isDynamicallyRegisteredOAuthClient } from "@/lib/auth/oauth-policy";
import { prisma } from "@/lib/db/prisma";
import type { ConnectedApp } from "@/lib/schemas/connected-app";

export async function getConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const liveRefresh = { userId, revoked: null, expiresAt: { gt: new Date() } };
  const clients = await prisma.oauthClient.findMany({
    where: { OR: [{ consents: { some: { userId } } }, { refreshTokens: { some: liveRefresh } }] },
    select: {
      clientId: true,
      name: true,
      consents: { where: { userId }, select: { createdAt: true, scopes: true } },
      refreshTokens: {
        where: { userId },
        select: { createdAt: true, scopes: true, revoked: true, expiresAt: true },
      },
      accessTokens: { where: { userId }, select: { createdAt: true } },
    },
    orderBy: { clientId: "asc" },
  });
  return Promise.all(
    clients.map(async (client) => {
      const grants = [
        ...client.consents,
        ...client.refreshTokens.filter(
          (token) => !token.revoked && token.expiresAt > liveRefresh.expiresAt.gt,
        ),
      ];
      const connected = [...client.consents, ...client.refreshTokens];
      const issued = [...client.accessTokens, ...client.refreshTokens];
      return {
        clientId: client.clientId,
        name: client.name?.trim() || client.clientId,
        dynamic: isDynamicallyRegisteredOAuthClient(client.clientId),
        scopes: [...new Set(grants.flatMap((grant) => grant.scopes))],
        connectedAt: new Date(
          Math.min(...connected.map((grant) => grant.createdAt.getTime())),
        ).toISOString(),
        lastUsedAt: issued.length
          ? new Date(Math.max(...issued.map((token) => token.createdAt.getTime()))).toISOString()
          : null,
        createdTokens: await getAppCreatedTokens(userId, client.clientId),
      };
    }),
  );
}
