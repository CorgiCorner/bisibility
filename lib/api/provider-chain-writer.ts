import type { prisma } from "@/lib/db/prisma";
import type { ProviderKind } from "@/lib/providers/types";
import { providerChainOrderBy } from "@/lib/rank-check/provider-chain-order";

type ProviderChainClient = Pick<typeof prisma, "providerConnection">;

export async function renumberProviderChain(
  projectId: string,
  kind: ProviderKind,
  firstProvider: string,
  client: ProviderChainClient,
) {
  const connections = await client.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { id: true, provider: true },
    where: { kind, projectId },
  });
  const first = connections.find((connection) => connection.provider === firstProvider);
  const ordered = first
    ? [first, ...connections.filter((connection) => connection.id !== first.id)]
    : connections;
  const offset = first ? 0 : 1;

  await Promise.all(
    ordered.map((connection, index) =>
      client.providerConnection.update({
        data: { priority: index + offset },
        where: { id: connection.id },
      }),
    ),
  );
}
