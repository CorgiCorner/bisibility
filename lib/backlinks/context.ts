import "server-only";
import { selectActionPaymentCandidate } from "@/lib/action-payment/options";
import { prisma } from "@/lib/db/prisma";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";

export async function backlinksProject(projectId: string) {
  return prisma.project.findFirst({
    select: {
      id: true,
      ownerId: true,
      lookupCacheTtlSeconds: true,
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: {
          credentialsEncrypted: true,
          id: true,
          publicId: true,
          provider: true,
          credentialSource: true,
          updatedAt: true,
        },
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

export function backlinksSources(project: BacklinksProject) {
  return project.providerConnections.flatMap((connection) => {
    try {
      const provider = getSerpProvider(connection.provider);
      return supportsBacklinks(provider) ? [{ connection, provider }] : [];
    } catch {
      return [];
    }
  });
}

export function backlinksSource(
  project: BacklinksProject,
  preferredProvider?: string,
  paymentOptionId?: string,
) {
  const eligible = backlinksSources(project).filter(
    ({ provider }) => !preferredProvider || provider.id === preferredProvider,
  );
  return selectActionPaymentCandidate(eligible, undefined, paymentOptionId, "backlinks");
}

export type BacklinksSource = NonNullable<ReturnType<typeof backlinksSource>>;
