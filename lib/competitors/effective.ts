import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  CompetitorMarketOverrideMode,
  CompetitorScopePolicy,
  type CompetitorSource,
  type Prisma,
} from "@/lib/generated/prisma/client";
import { listProjectMarkets } from "@/lib/markets/registry";

export type EffectiveCompetitor = {
  aliases: string[];
  domain: string;
  evidence: Prisma.JsonValue | null;
  id: string;
  label: string | null;
  scopePolicy: CompetitorScopePolicy;
  source: CompetitorSource;
};

export class CompetitorMarketNotFoundError extends Error {
  constructor() {
    super("Competitor market not found.");
    this.name = "CompetitorMarketNotFoundError";
  }
}

const orderBy: Prisma.CompetitorOrderByWithRelationInput[] = [
  { domain: "asc" },
  { publicId: "asc" },
];

const effectiveCompetitorSelect = {
  aliases: true,
  domain: true,
  evidence: true,
  label: true,
  publicId: true,
  scopePolicy: true,
  source: true,
} as const;

type EffectiveCompetitorRecord = Omit<EffectiveCompetitor, "id"> & { publicId: string };

function publicCompetitor(competitor: EffectiveCompetitorRecord): EffectiveCompetitor {
  return {
    aliases: competitor.aliases,
    domain: competitor.domain,
    evidence: competitor.evidence,
    id: competitor.publicId,
    label: competitor.label,
    scopePolicy: competitor.scopePolicy,
    source: competitor.source,
  };
}

function belongsInMarket(
  competitor: EffectiveCompetitorRecord & {
    marketOverrides: Array<{ mode: CompetitorMarketOverrideMode }>;
  },
) {
  const mode = competitor.marketOverrides[0]?.mode;
  return competitor.scopePolicy === CompetitorScopePolicy.all_markets
    ? mode !== CompetitorMarketOverrideMode.excluded
    : mode === CompetitorMarketOverrideMode.added;
}

/** Returns the complete project set or the exact effective set for one visible project market. */
export async function effectiveCompetitors(projectId: string, marketId: string | null) {
  if (marketId === null) {
    const competitors = await prisma.competitor.findMany({
      orderBy,
      select: effectiveCompetitorSelect,
      where: { projectId },
    });
    return competitors.map(publicCompetitor);
  }

  const markets = await listProjectMarkets(projectId);
  if (!markets.some((market) => market.id === marketId)) {
    throw new CompetitorMarketNotFoundError();
  }
  const competitors = await prisma.competitor.findMany({
    orderBy,
    select: {
      ...effectiveCompetitorSelect,
      marketOverrides: {
        select: { mode: true },
        where: { projectMarketId: marketId },
      },
    } as const,
    where: { projectId },
  });
  return competitors.filter(belongsInMarket).map(publicCompetitor);
}
