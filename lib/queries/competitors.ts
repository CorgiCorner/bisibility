import "server-only";

import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import type { CompetitorScope } from "@/lib/competitors/scope-model";
import {
  COMPETITOR_ENGINE,
  competitorMarketKey,
  resolveCompetitorMarket,
} from "@/lib/competitors/scope-model";
import type { CompetitorMarketOption } from "@/lib/competitors/types";
import { normalizeCompetitorDomain } from "@/lib/competitors/types";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { storedOrganicDomainRanks } from "@/lib/rank-check/organic-ranks";
import { requireReadableProject } from "./_auth";
import { legacyOrganicRanks } from "./competitor-legacy-ranks";
import type { QueryKeywordDetail } from "./competitor-query-model";
import {
  competitorMarketData,
  competitorSuggestions,
  managedCompetitor,
  summarizeCompetitorMarkets,
} from "./competitor-query-model";

const LEGACY_FALLBACK_MAX = 500;

async function queryCompetitors(
  projectId: string,
  requested: CompetitorScope | null | undefined,
  includeAllMarkets: boolean,
) {
  const { project } = await requireReadableProject(projectId);
  const ownDomain = normalizeCompetitorDomain(project.domain) ?? project.domain;
  const [competitorRows, keywordSummaries] = await Promise.all([
    prisma.competitor.findMany({
      orderBy: [{ label: "asc" }, { domain: "asc" }],
      select: { domain: true, label: true, publicId: true },
      where: { projectId: project.id },
    }),
    prisma.keyword.findMany({
      orderBy: [{ id: "asc" }],
      select: {
        device: true,
        id: true,
        locationId: true,
        locationRef: {
          select: {
            canonicalKey: true,
            cityName: true,
            countryCode: true,
            displayName: true,
            hl: true,
            kind: true,
            languageLabel: true,
            regionCode: true,
          },
        },
        rankChecks: {
          orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          select: { organicRanks: true, position: true },
          take: 1,
          where: { status: "completed" },
        },
      },
      where: { projectId: project.id },
    }),
  ]);
  const summaries = summarizeCompetitorMarkets(keywordSummaries);
  const selected = resolveCompetitorMarket(summaries, requested);
  const managed = competitorRows.map(managedCompetitor);
  const details =
    includeAllMarkets || selected
      ? await prisma.keyword.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            device: true,
            id: true,
            locationId: true,
            publicId: true,
            tags: { select: { tag: { select: { name: true } } } },
            text: true,
          },
          where: includeAllMarkets
            ? { projectId: project.id }
            : { device: selected?.device, locationId: selected?.locationId, projectId: project.id },
        })
      : [];
  const latestByKeyword = new Map(
    keywordSummaries.flatMap((keyword) =>
      keyword.rankChecks[0] ? [[keyword.id, keyword.rankChecks[0]] as const] : [],
    ),
  );
  const missingSnapshotIds = keywordSummaries
    .filter(
      (keyword) =>
        keyword.rankChecks.length > 0 &&
        storedOrganicDomainRanks(keyword.rankChecks[0]?.organicRanks) === null,
    )
    .map((keyword) => keyword.id);
  const missingSnapshotIdSet = new Set(missingSnapshotIds);
  const prioritizedMissingIds = [
    ...details.map((keyword) => keyword.id).filter((id) => missingSnapshotIdSet.has(id)),
    ...missingSnapshotIds,
  ];
  const fallbackIds = [...new Set(prioritizedMissingIds)].slice(0, LEGACY_FALLBACK_MAX);
  const legacyRows = await legacyOrganicRanks(project.id, fallbackIds);
  const legacyRanks = new Map(legacyRows.map((row) => [row.keywordId, row.ranks]));
  const suggestions = competitorSuggestions(summaries, legacyRows, ownDomain, managed);
  const detailsByMarket = new Map<string, QueryKeywordDetail[]>();
  for (const keyword of details) {
    const key = competitorMarketKey({
      device: keyword.device,
      engine: COMPETITOR_ENGINE,
      locationId: keyword.locationId,
    });
    const existing = detailsByMarket.get(key);
    if (existing) existing.push(keyword);
    else detailsByMarket.set(key, [keyword]);
  }
  const buildMarket = (option: CompetitorMarketOption) =>
    buildCompetitorMarket(
      competitorMarketData(
        option,
        detailsByMarket.get(option.key) ?? [],
        latestByKeyword,
        legacyRanks,
        ownDomain,
        managed,
      ),
      emptyCompetitorFilter,
    );
  const market = selected ? buildMarket(selected) : null;

  return {
    allMarkets: includeAllMarkets ? summaries.map(buildMarket) : null,
    managedCompetitors: managed,
    market,
    marketOptions: summaries.map(({ observations: _observations, ...option }) => option),
    projectId: requiredProjectPublicId(project.publicId),
    scope:
      requested ??
      (selected
        ? { device: selected.device, engine: selected.engine, locationId: selected.locationId }
        : null),
    suggestions,
  };
}

function requiredProjectPublicId(value: string) {
  if (!isPublicIdOfType(value, "prj")) {
    throw new Error("Project public ID is not available.");
  }
  return value;
}

export async function getCompetitorsView(projectId: string, requested?: CompetitorScope | null) {
  const result = await queryCompetitors(projectId, requested, false);
  return {
    managedCompetitors: result.managedCompetitors,
    market: result.market,
    markets: result.marketOptions,
    projectId: result.projectId,
    scope: result.scope,
    suggestions: result.suggestions,
  };
}

export async function getCompetitorsApiView(projectId: string) {
  const result = await queryCompetitors(projectId, null, true);
  return {
    managedCompetitors: result.managedCompetitors,
    markets: result.allMarkets ?? [],
    projectId: result.projectId,
    suggestions: result.suggestions,
  };
}
