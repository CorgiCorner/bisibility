import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";

const selectableStatuses = [ProjectMarketStatus.active, ProjectMarketStatus.paused];

export type CompetitorSetMarket = { id: string; label: string };
export type CompetitorSetOverride = {
  marketId: string;
  marketLabel: string;
  mode: "added" | "excluded";
};
export type CompetitorSetRow = {
  aliases: string[];
  createdAt: Date;
  domain: string;
  evidence: unknown;
  overrides: CompetitorSetOverride[];
  publicId: string;
  scopePolicy: "all_markets" | "selected_markets";
  source: "manual" | "suggested";
};

export type CompetitorSetSettingsModel = {
  competitors: CompetitorSetRow[];
  markets: CompetitorSetMarket[];
};

/** Raw project policy and delta records for Settings editing, never effective membership. */
export async function getCompetitorSetSettings(
  projectId: string,
): Promise<CompetitorSetSettingsModel> {
  const [competitors, markets] = await Promise.all([
    prisma.competitor.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        aliases: true,
        createdAt: true,
        domain: true,
        evidence: true,
        marketOverrides: {
          select: {
            mode: true,
            projectMarket: {
              select: {
                location: { select: { displayName: true } },
                publicId: true,
              },
            },
          },
          where: { projectMarket: { status: { in: selectableStatuses } } },
        },
        publicId: true,
        scopePolicy: true,
        source: true,
      },
      where: { projectId },
    }),
    prisma.projectMarket.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { location: { select: { displayName: true } }, publicId: true },
      where: { projectId, status: { in: selectableStatuses } },
    }),
  ]);

  return {
    competitors: competitors.map((competitor) => ({
      aliases: competitor.aliases,
      createdAt: competitor.createdAt,
      domain: competitor.domain,
      evidence: competitor.evidence,
      overrides: competitor.marketOverrides.map((override) => ({
        marketId: override.projectMarket.publicId,
        marketLabel: override.projectMarket.location.displayName,
        mode: override.mode,
      })),
      publicId: competitor.publicId,
      scopePolicy: competitor.scopePolicy,
      source: competitor.source,
    })),
    markets: markets.map((market) => ({
      id: market.publicId,
      label: market.location.displayName,
    })),
  };
}
