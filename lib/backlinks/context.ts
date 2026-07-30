import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";

export async function backlinksProject(projectId: string) {
  return prisma.project.findFirst({
    select: {
      budgetCapCents: true,
      id: true,
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: { credentialsEncrypted: true, id: true, provider: true },
        where: providerChainWhere("serp"),
      },
      publicId: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

type BacklinksProject = NonNullable<Awaited<ReturnType<typeof backlinksProject>>>;

type BacklinksProvider = SerpProvider & {
  fetchBacklinksHistory: NonNullable<SerpProvider["fetchBacklinksHistory"]>;
  fetchBacklinksRows: NonNullable<SerpProvider["fetchBacklinksRows"]>;
  fetchBacklinksSummary: NonNullable<SerpProvider["fetchBacklinksSummary"]>;
};

function supportsBacklinks(provider: SerpProvider): provider is BacklinksProvider {
  return (
    typeof provider.fetchBacklinksHistory === "function" &&
    typeof provider.fetchBacklinksRows === "function" &&
    typeof provider.fetchBacklinksSummary === "function"
  );
}

export function backlinksSource(project: BacklinksProject, preferredProvider?: string) {
  const eligible = project.providerConnections.flatMap((connection) => {
    const provider = getSerpProvider(connection.provider);
    return supportsBacklinks(provider) ? [{ connection, provider }] : [];
  });
  return (
    eligible.find(({ provider }) => provider.id === preferredProvider) ??
    (preferredProvider ? undefined : eligible[0])
  );
}

export type BacklinksSource = NonNullable<ReturnType<typeof backlinksSource>>;
