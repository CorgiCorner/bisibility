import "server-only";

import { monthlyTrackingCostCents } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import { primaryProviderConnection } from "@/lib/rank-check/provider-chain-order";
import { supportsResearchMarket } from "@/lib/serp/market-capability";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { requireReadableProject } from "./_auth";

export type ProjectMarketsView = {
  markets: {
    canonicalKey: string;
    countryCode: string;
    displayName: string;
    id: string;
    languageLabel: string;
    languageCode: string;
    monthlyCostCents: number | null;
    researchAvailable: boolean;
    status: "active" | "paused";
  }[];
  maxMarkets: number;
  monthlyCostCents: number | null;
  perMarketChecks: number;
  projectId: string;
};

export async function getProjectMarkets(projectRef: string): Promise<ProjectMarketsView> {
  const { project } = await requireReadableProject(projectRef);
  const data = await prisma.project.findUnique({
    include: {
      defaults: true,
      keywords: { select: { device: true, text: true } },
      markets: {
        include: { location: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        where: { status: { in: ["active", "paused"] } },
      },
      providerConnections: true,
    },
    where: { id: project.id },
  });
  if (!data) throw new Error("Project not found.");

  const deviceCount = new Set(data.keywords.map((keyword) => keyword.device)).size || 1;
  const keywordCount = new Set(
    data.keywords.map((keyword) => keyword.text.trim().toLocaleLowerCase("en-US")),
  ).size;
  const perMarketChecks = keywordCount * deviceCount;
  const primary = primaryProviderConnection(data.providerConnections, "serp");
  const estimatedMonthlyCost = monthlyTrackingCostCents(perMarketChecks, {
    cronExpression: data.defaults?.cronExpression ?? null,
    depth: resolveSerpDepth(data.defaults?.serpDepth),
    overrideCents: primary?.costPerCheckCents == null ? null : Number(primary.costPerCheckCents),
    providerId: primary?.provider ?? null,
    rawFrequency: data.defaults?.frequency ?? "manual",
  });
  const monthlyCostCents = estimatedMonthlyCost == null ? null : Number(estimatedMonthlyCost);
  const markets: ProjectMarketsView["markets"] = data.markets.map((market) => ({
    canonicalKey: market.location.canonicalKey,
    countryCode: market.location.countryCode,
    displayName: market.location.displayName,
    id: market.publicId,
    languageLabel: market.location.languageLabel,
    languageCode: market.location.languageCode,
    monthlyCostCents: monthlyCostCents ?? null,
    researchAvailable: supportsResearchMarket(
      market.location.countryCode,
      market.location.languageCode,
    ),
    status: market.status === "active" ? "active" : "paused",
  }));
  const activeCount = markets.filter((market) => market.status === "active").length;

  return {
    markets,
    maxMarkets: MAX_PROJECT_MARKETS,
    monthlyCostCents: monthlyCostCents == null ? null : monthlyCostCents * activeCount,
    perMarketChecks,
    projectId: data.publicId,
  };
}
