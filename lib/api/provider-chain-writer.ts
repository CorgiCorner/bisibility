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

/** Call under the project mutation lock so concurrent connects cannot both become primary. */
export async function newSerpConnectionSettings(projectId: string, client: ProviderChainClient) {
  const connections = await client.providerConnection.findMany({
    select: { enabled: true, priority: true },
    where: { kind: "serp", projectId },
  });
  return {
    enabled: !connections.some((connection) => connection.enabled),
    priority:
      connections.length === 0
        ? 0
        : Math.max(...connections.map((connection) => connection.priority)) + 1,
  };
}

export async function connectedProviderChainSettings(
  projectId: string,
  kind: ProviderKind,
  before: { enabled: boolean; priority: number; status?: string } | null,
  input: { enabled: boolean; priority?: number },
  options: { restoreStoredCredentials?: boolean; activateStoredCredentials?: boolean },
  client: ProviderChainClient,
) {
  if (kind === "serp" && !before) return newSerpConnectionSettings(projectId, client);
  const connections = await client.providerConnection.findMany({
    select: { priority: true },
    where: { kind, projectId },
  });
  const priority =
    input.priority ??
    before?.priority ??
    (connections.length === 0
      ? 0
      : Math.max(...connections.map((connection) => connection.priority)) + 1);
  const enabled =
    options.restoreStoredCredentials && before
      ? options.activateStoredCredentials === true || before.enabled
      : priority === 0 ||
        (kind === "serp"
          ? Boolean(before?.enabled && (!before.status || before.status === "connected"))
          : input.enabled);
  return { priority, enabled };
}
