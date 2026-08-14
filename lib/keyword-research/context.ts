import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { prisma } from "@/lib/db/prisma";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { normalizeCanonicalLocationKey, serpRankLocation } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import type { KeywordResearchConnection } from "./types";

export async function keywordResearchProject(projectId: string) {
  return prisma.project.findFirst({
    select: {
      budgetCapCents: true,
      defaults: { include: { locationRef: true } },
      id: true,
      keywords: { select: { device: true, location: true, locationRef: true, text: true } },
      savedKeywords: {
        select: { countryCode: true, languageCode: true, location: true, normalizedText: true },
      },
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
        where: providerChainWhere("serp"),
      },
      publicId: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

export async function keywordResearchPageProject(projectId: string) {
  return prisma.project.findFirst({
    select: {
      defaults: { include: { locationRef: true } },
      id: true,
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
        where: providerChainWhere("serp"),
      },
      publicId: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

export type KeywordResearchProject = NonNullable<
  Awaited<ReturnType<typeof keywordResearchProject>>
>;
export type KeywordResearchPageProject = NonNullable<
  Awaited<ReturnType<typeof keywordResearchPageProject>>
>;

export function hasResearchCapabilities(provider: SerpProvider) {
  return (
    typeof provider.fetchRelatedKeywords === "function" &&
    typeof provider.fetchKeywordSuggestions === "function" &&
    typeof provider.fetchKeywordIdeas === "function"
  );
}

export function eligibleResearchConnections(
  project: Pick<KeywordResearchProject, "providerConnections">,
  capability: "metrics" | "research",
) {
  return project.providerConnections.flatMap((connection) => {
    const provider = getSerpProvider(connection.provider);
    const eligible =
      capability === "metrics"
        ? typeof provider.fetchKeywordMetrics === "function"
        : hasResearchCapabilities(provider);
    return eligible ? [{ connection, provider }] : [];
  });
}

export function connectionResources(
  eligible: ReturnType<typeof eligibleResearchConnections>,
): KeywordResearchConnection[] {
  return eligible.map(({ connection, provider }) => ({
    id: requireApiPublicId(connection.publicId ?? "", "conn"),
    label: provider.label,
    provider: provider.id,
  }));
}

export async function researchLocation(project: KeywordResearchProject, overrideKey?: string) {
  const market = projectDefaultSerpMarket(project.defaults, project.keywords);
  const locationKey = overrideKey ?? market.locationKey;
  const normalized = normalizeCanonicalLocationKey(locationKey);
  const persisted =
    overrideKey === undefined
      ? (project.defaults?.locationRef ??
        project.keywords.find((keyword) => keyword.locationRef?.canonicalKey === market.locationKey)
          ?.locationRef)
      : project.keywords.find((keyword) => keyword.locationRef?.canonicalKey === overrideKey)
          ?.locationRef;
  if (persisted) return { key: persisted.canonicalKey, value: serpRankLocation(persisted) };
  const resolved = await resolveKeywordLocation({
    projectId: project.id,
    selection: normalized.selector.cityName
      ? { canonicalKey: normalized.canonicalKey, kind: "city" }
      : {
          countryCode: normalized.selector.countryCode,
          kind: "country",
          languageCode: normalized.selector.languageCode,
        },
  });
  return { key: resolved.location.canonicalKey, value: serpRankLocation(resolved.location) };
}

export function normalizeResearchKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
