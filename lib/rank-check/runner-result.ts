import type { Prisma } from "@/lib/generated/prisma/client";
import type { SerpDepth } from "@/lib/serp/markets";
import type { RankNormalizationVersion } from "./normalization-version";
import type { OrganicDomainRank } from "./organic-ranks";

export type RankCheckRunResult = {
  comparisonAllowed: boolean;
  providerCostCents?: number;
  rankCheck: {
    billingUnits: number | null;
    checkedAt: Date;
    costCents: number;
    estimatedCostCents: number | null;
    keywordId: string;
    normalizationVersion: RankNormalizationVersion;
    organicRanks: OrganicDomainRank[] | null;
    position: number | null;
    previousPosition: number | null;
    provider: string;
    rankingUrl: string | null;
    raw: Prisma.InputJsonObject | null;
    requestedDepth: SerpDepth;
  };
  scheduleUpdate: {
    lastCheckedAt: Date;
    nextCheckAt: Date | null;
  };
};
