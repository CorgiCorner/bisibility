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
  quality: CompetitorMarket["quality"];
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
  return {
    quality: market.quality,
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
      shareOfVoice: share.shareOfVoice === null ? null : share.shareOfVoice / 100,
    })),
  };
}
