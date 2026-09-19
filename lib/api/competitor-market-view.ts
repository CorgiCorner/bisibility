import "server-only";

import type { CompetitorMarket, CompetitorObservation } from "@/lib/competitors/types";

type CompetitorMarketApiObservation = {
  checkedAt: string | null;
  completed: boolean;
  id: string;
  keyword: string;
  keywordId: string;
  ranked: boolean;
  ranks: Record<string, number | null>;
  tags: string[];
};

type CompetitorMarketApiView = {
  checkedKeywordCount: number;
  country: string;
  dataState: CompetitorMarket["dataState"];
  device: "Desktop" | "Mobile";
  domains: Array<{ domain: string; managed: boolean }>;
  engine: "Google";
  id: string;
  measuredAt: string | null;
  observations: CompetitorMarketApiObservation[];
  sharedKeywordCount: number;
  shares: Array<{
    domain: string;
    sharedKeywords: number;
    shareOfVoice: number | null;
  }>;
};

function visibilityScore(position: number) {
  return position <= 10 ? 11 - position : 0;
}

function marketScores(market: CompetitorMarket) {
  const domains = market.allColumns.map((column) => column.domain);
  const scores = new Map<string, number>();
  for (const observation of market.observations) {
    if (!observation.completed) continue;
    const volume = Math.max(0, observation.volume ?? 0);
    for (const domain of domains) {
      const rank = observation.ranks[domain];
      if (typeof rank !== "number" || rank <= 0) continue;
      scores.set(domain, (scores.get(domain) ?? 0) + visibilityScore(rank) * volume);
    }
  }
  const total = domains.reduce((sum, domain) => sum + (scores.get(domain) ?? 0), 0);
  return { scores, total };
}

function measuredAt(observations: CompetitorObservation[]) {
  return (
    observations
      .filter((observation) => observation.completed && observation.checkedAt)
      .map((observation) => observation.checkedAt as string)
      .sort()
      .at(-1) ?? null
  );
}

export function competitorMarketApiView(market: CompetitorMarket): CompetitorMarketApiView {
  const { scores, total } = marketScores(market);
  const ranked = market.dataState === "ranked" && total > 0;
  return {
    checkedKeywordCount: market.checkedKeywordCount,
    country: market.location,
    dataState: market.dataState,
    device: market.device === "mobile" ? "Mobile" : "Desktop",
    domains: market.allColumns.map((column) => ({
      domain: column.domain,
      managed: column.kind === "Managed",
    })),
    engine: "Google",
    id: market.key,
    measuredAt: measuredAt(market.observations),
    observations: market.observations.map((observation) => ({
      checkedAt: observation.checkedAt ?? null,
      completed: observation.completed,
      id: observation.id,
      keyword: observation.keyword,
      keywordId: observation.id,
      ranked: observation.ranked,
      ranks: observation.ranks,
      tags: observation.tags,
    })),
    sharedKeywordCount: market.sharedKeywordCount,
    shares: market.shares.map((share) => ({
      domain: share.domain,
      sharedKeywords: share.sharedKeywords,
      shareOfVoice: ranked ? (scores.get(share.domain) ?? 0) / total : null,
    })),
  };
}
