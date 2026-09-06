import "server-only";

import { monthlyTrackingCostCents } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import { listArchivedProjectMarkets } from "@/lib/markets/registry";
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

/** A market as a chrome surface offers it: the name the reader knows, and its URL ref. */
export type ProjectMarketOption = { label: string; ref: string };

/**
 * The visible markets of a project and nothing else. The shell renders on every page, so this
 * deliberately does not go through `getProjectMarkets`, which also prices the project. The label
 * is the one the markets settings page uses, because the language is what keeps `Belgium / Dutch`
 * apart from `Belgium / French`.
 */
export async function listProjectMarketOptions(projectRef: string): Promise<ProjectMarketOption[]> {
  const { project } = await requireReadableProject(projectRef);
  const markets = await prisma.projectMarket.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      location: { select: { displayName: true, languageLabel: true } },
      publicId: true,
    },
    where: { projectId: project.id, status: { in: ["active", "paused"] } },
  });

  return markets.map((market) => ({
    label: `${market.location.displayName} / ${market.location.languageLabel}`,
    ref: market.publicId,
  }));
}

export type ArchivedProjectMarketsView = {
  markets: {
    displayName: string;
    id: string;
    keywordCount: number;
    languageLabel: string;
  }[];
  projectId: string;
};

/** Archived markets plus the keywords a restore resumes, so the UI states the cost first. */
export async function getArchivedProjectMarkets(
  projectRef: string,
): Promise<ArchivedProjectMarketsView> {
  const { project } = await requireReadableProject(projectRef);
  const archived = await listArchivedProjectMarkets(project.id);
  const counts = await prisma.keyword.groupBy({
    _count: { _all: true },
    by: ["locationId"],
    where: {
      archivedAt: null,
      locationId: { in: archived.map((market) => market.locationId) },
      projectId: project.id,
    },
  });
  const countByLocation = new Map(counts.map((row) => [row.locationId, row._count._all]));

  return {
    markets: archived.map((market) => ({
      displayName: market.location.displayName,
      id: market.publicId,
      keywordCount: countByLocation.get(market.locationId) ?? 0,
      languageLabel: market.location.languageLabel,
    })),
    projectId: project.publicId,
  };
}
