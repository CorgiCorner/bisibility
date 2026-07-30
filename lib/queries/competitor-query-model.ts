import { competitorDomainInitials } from "@/lib/competitors/competitor-market-model";
import { COMPETITOR_ENGINE, competitorMarketKey } from "@/lib/competitors/scope-model";
import type {
  CompetitorColumn,
  CompetitorMarketData,
  CompetitorMarketOption,
  CompetitorObservation,
  ManagedCompetitor,
  SuggestedCompetitor,
} from "@/lib/competitors/types";
import { normalizeCompetitorDomain } from "@/lib/competitors/types";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { OrganicDomainRank } from "@/lib/rank-check/organic-ranks";
import { storedOrganicDomainRanks } from "@/lib/rank-check/organic-ranks";

export type ManagedRow = { domain: string; label: string | null; publicId: string | null };
export type LatestRank = { organicRanks: unknown; position: number | null };
export type QueryKeywordSummary = {
  device: "desktop" | "mobile";
  id: string;
  locationId: string;
  locationRef: {
    canonicalKey: string;
    cityName: string | null;
    countryCode: string;
    displayName: string;
    hl: string;
    kind: "country" | "region" | "city";
    languageLabel: string;
    regionCode: string | null;
  };
  rankChecks: LatestRank[];
};
export type QueryKeywordDetail = {
  device: "desktop" | "mobile";
  id: string;
  locationId: string;
  publicId: string;
  tags: Array<{ tag: { name: string } }>;
  text: string;
};
export type MarketSummary = CompetitorMarketOption & { observations: OrganicDomainRank[][] };

function addRank(ranks: Map<string, number>, domain: string, position: number | null) {
  if (!position || position <= 0) return;
  const current = ranks.get(domain);
  if (!current || position < current) ranks.set(domain, position);
}

export function managedCompetitor(row: ManagedRow): ManagedCompetitor {
  const domain = normalizeCompetitorDomain(row.domain) ?? row.domain;
  if (!row.publicId || !isPublicIdOfType(row.publicId, "cmp")) {
    throw new Error("Competitor public ID is not available.");
  }
  return {
    domain,
    id: row.publicId,
    initials: competitorDomainInitials(domain),
    label: row.label ?? domain,
  };
}

export function summarizeCompetitorMarkets(keywords: QueryKeywordSummary[]) {
  const summaries = new Map<string, MarketSummary>();
  for (const keyword of keywords) {
    const key = competitorMarketKey({
      device: keyword.device,
      engine: COMPETITOR_ENGINE,
      locationId: keyword.locationId,
    });
    const existing =
      summaries.get(key) ??
      ({
        canonicalKey: keyword.locationRef.canonicalKey,
        checkedKeywordCount: 0,
        cityName: keyword.locationRef.cityName,
        countryCode: keyword.locationRef.countryCode,
        device: keyword.device,
        engine: COMPETITOR_ENGINE,
        hl: keyword.locationRef.hl,
        key,
        keywordCount: 0,
        languageLabel: keyword.locationRef.languageLabel,
        location: keyword.locationRef.displayName,
        locationId: keyword.locationId,
        locationKind: keyword.locationRef.kind,
        observations: [],
        regionName: keyword.locationRef.regionCode,
      } satisfies MarketSummary);
    existing.keywordCount += 1;
    const ranks = storedOrganicDomainRanks(keyword.rankChecks[0]?.organicRanks);
    if (keyword.rankChecks.length > 0) existing.checkedKeywordCount += 1;
    if (ranks) existing.observations.push(ranks);
    summaries.set(key, existing);
  }
  return [...summaries.values()].sort(
    (a, b) =>
      b.checkedKeywordCount - a.checkedKeywordCount ||
      b.keywordCount - a.keywordCount ||
      a.location.localeCompare(b.location) ||
      a.device.localeCompare(b.device),
  );
}

function column(domain: string, label: string, kind: CompetitorColumn["kind"], id?: string) {
  return { domain, id, kind, label } satisfies CompetitorColumn;
}

export function competitorMarketData(
  option: CompetitorMarketOption,
  keywords: QueryKeywordDetail[],
  latestByKeyword: Map<string, LatestRank>,
  legacyRanks: Map<string, OrganicDomainRank[]>,
  ownDomain: string,
  managed: ManagedCompetitor[],
): CompetitorMarketData {
  const managedDomains = managed.map((item) => item.domain);
  const tagSet = new Set<string>();
  const observations: CompetitorObservation[] = keywords.map((keyword) => {
    const tags = keyword.tags.map((entry) => entry.tag.name);
    for (const tag of tags) tagSet.add(tag);
    const latest = latestByKeyword.get(keyword.id);
    const organicRanks =
      storedOrganicDomainRanks(latest?.organicRanks) ?? legacyRanks.get(keyword.id) ?? [];
    const ranks = new Map<string, number>();
    for (const item of organicRanks) addRank(ranks, item.domain, item.position);
    addRank(ranks, ownDomain, latest?.position ?? null);
    return {
      completed: Boolean(latest),
      id: keyword.publicId,
      keyword: keyword.text,
      ranked: ranks.size > 0,
      ranks: Object.fromEntries(
        [ownDomain, ...managedDomains].map((domain) => [domain, ranks.get(domain) ?? null]),
      ),
      tags,
    };
  });
  return {
    allColumns: [
      column(ownDomain, ownDomain, "You"),
      ...managed.map((item) => column(item.domain, item.label, "Managed", item.id)),
    ],
    competitorCount: managed.length,
    device: option.device,
    engine: COMPETITOR_ENGINE,
    key: option.key,
    location: option.location,
    locationId: option.locationId,
    locationKind: option.locationKind,
    observations,
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    trackedKeywordCount: keywords.length,
  };
}

export function competitorSuggestions(
  summaries: MarketSummary[],
  legacyRows: Array<{ ranks: OrganicDomainRank[] }>,
  ownDomain: string,
  managed: ManagedCompetitor[],
) {
  const counts = new Map<string, number>();
  for (const ranks of [
    ...summaries.flatMap((summary) => summary.observations),
    ...legacyRows.map((row) => row.ranks),
  ]) {
    for (const rank of ranks) counts.set(rank.domain, (counts.get(rank.domain) ?? 0) + 1);
  }
  const managedDomains = new Set(managed.map((item) => item.domain));
  const suggestions: SuggestedCompetitor[] = [];
  for (const [domain, overlap] of counts) {
    if (domain !== ownDomain && !managedDomains.has(domain) && overlap > 0) {
      suggestions.push({ domain, initials: competitorDomainInitials(domain), overlap });
    }
  }
  return suggestions
    .sort((a, b) => b.overlap - a.overlap || a.domain.localeCompare(b.domain))
    .slice(0, 5);
}
