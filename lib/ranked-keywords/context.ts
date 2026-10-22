import "server-only";
import { requireApiPublicId } from "@/lib/api/public-id";
import { prisma } from "@/lib/db/prisma";
import { getSerpProvider } from "@/lib/providers/registry";
import type { RankedKeywordRow, SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { serpRankLocation } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";

type CapableProvider = SerpProvider & {
  fetchRankedKeywords: NonNullable<SerpProvider["fetchRankedKeywords"]>;
};

function capable(provider: SerpProvider): provider is CapableProvider {
  return typeof provider.fetchRankedKeywords === "function";
}

function isUnknownSerpProviderError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Unknown SERP provider:");
}

export async function projectState(projectId: string) {
  return prisma.project.findFirst({
    select: {
      defaults: { include: { locationRef: true } },
      domain: true,
      id: true,
      ownerId: true,
      lookupCacheTtlSeconds: true,
      keywords: { select: { device: true, location: true, locationRef: true, text: true } },
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: {
          credentialsEncrypted: true,
          credentialSource: true,
          id: true,
          provider: true,
          publicId: true,
        },
        where: providerChainWhere("serp"),
      },
      publicId: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

export function eligibleConnections(
  project: NonNullable<Awaited<ReturnType<typeof projectState>>>,
) {
  return project.providerConnections.flatMap((connection) => {
    try {
      const provider = getSerpProvider(connection.provider);
      return capable(provider) ? [{ connection, provider }] : [];
    } catch (error) {
      if (!isUnknownSerpProviderError(error)) throw error;
      return [];
    }
  });
}

export async function listEligibleRankedKeywordConnections(projectId: string) {
  const project = await projectState(projectId);
  if (!project) return [];
  return eligibleConnections(project).map(({ connection, provider }) => ({
    id: requireApiPublicId(connection.publicId ?? "", "conn"),
    label: provider.label,
    provider: provider.id,
  }));
}

export async function resolvedLocation(
  project: NonNullable<Awaited<ReturnType<typeof projectState>>>,
) {
  const market = projectDefaultSerpMarket(project.defaults, project.keywords);
  const persisted =
    project.defaults?.locationRef ??
    project.keywords.find((keyword) => keyword.locationRef?.canonicalKey === market.locationKey)
      ?.locationRef;
  if (persisted) return { key: persisted.canonicalKey, value: serpRankLocation(persisted) };
  const resolved = await resolveKeywordLocation({
    projectId: project.id,
    selection: { canonicalKey: market.locationKey, kind: "city" },
  });
  return { key: resolved.location.canonicalKey, value: serpRankLocation(resolved.location) };
}

export function annotate(rows: RankedKeywordRow[], texts: string[]) {
  const tracked = new Set(texts.map((text) => text.trim().toLowerCase()));
  return rows.map((row) => ({
    ...row,
    alreadyTracked: tracked.has(row.keyword.trim().toLowerCase()),
  }));
}
