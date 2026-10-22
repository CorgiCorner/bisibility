import "server-only";
import { selectActionPaymentCandidate } from "@/lib/action-payment/options";
import { prisma } from "@/lib/db/prisma";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";

export async function domainOverviewProject(projectId: string) {
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

type SelectedProject = NonNullable<Awaited<ReturnType<typeof domainOverviewProject>>>;
export type DomainOverviewProject = Omit<SelectedProject, "lookupCacheTtlSeconds"> & {
  lookupCacheTtlSeconds?: number | null;
};

type DomainOverviewProvider = SerpProvider & {
  fetchDomainRankOverview: NonNullable<SerpProvider["fetchDomainRankOverview"]>;
  fetchHistoricalRankOverview: NonNullable<SerpProvider["fetchHistoricalRankOverview"]>;
  fetchRankedKeywords: NonNullable<SerpProvider["fetchRankedKeywords"]>;
  fetchRelevantPages: NonNullable<SerpProvider["fetchRelevantPages"]>;
};

function supportsDomainOverview(provider: SerpProvider): provider is DomainOverviewProvider {
  return (
    typeof provider.fetchDomainRankOverview === "function" &&
    typeof provider.fetchHistoricalRankOverview === "function" &&
    typeof provider.fetchRankedKeywords === "function" &&
    typeof provider.fetchRelevantPages === "function"
  );
}

function isUnknownSerpProviderError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Unknown SERP provider:");
}

export function domainOverviewSources(project: DomainOverviewProject) {
  return project.providerConnections.flatMap((connection) => {
    try {
      const provider = getSerpProvider(connection.provider);
      return supportsDomainOverview(provider) ? [{ connection, provider }] : [];
    } catch (error) {
      if (!isUnknownSerpProviderError(error)) throw error;
      return [];
    }
  });
}

export function domainOverviewSource(project: DomainOverviewProject, paymentOptionId?: string) {
  return selectActionPaymentCandidate(
    domainOverviewSources(project),
    undefined,
    paymentOptionId,
    "domain_overview",
  );
}

export type DomainOverviewSource = NonNullable<ReturnType<typeof domainOverviewSource>>;

export async function requireDomainOverviewSource(projectId: string, paymentOptionId?: string) {
  const project = await domainOverviewProject(projectId);
  if (!project) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  const source = domainOverviewSource(project, paymentOptionId);
  if (!source) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return { project, source };
}
