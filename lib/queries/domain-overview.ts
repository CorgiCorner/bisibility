import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  domainOverviewCatalogMarkets,
  domainOverviewCountryMarket,
  domainOverviewTrackedMarkets,
} from "@/lib/domain-overview/market-options";
import { recentDomainOverviewTargets } from "@/lib/domain-overview/recent";
import { serpProviderCapabilities } from "@/lib/providers/registry";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";
import { getProjectCostContext } from "./cost-calculator";

function providerStatus(
  connections: Array<{ provider: string; status: string }>,
): "connected" | "needs_reauth" | "no_provider" {
  const eligible = connections.filter(
    (connection) => serpProviderCapabilities(connection.provider)?.domainOverview,
  );
  if (eligible.some((connection) => connection.status === "connected")) return "connected";
  if (eligible.some((connection) => connection.status === "needs_reauth")) return "needs_reauth";
  return "no_provider";
}

const domainOverviewMarketSelect = {
  canonicalKey: true,
  cityName: true,
  countryCode: true,
  displayName: true,
  hl: true,
  kind: true,
  languageCode: true,
  languageLabel: true,
  primaryGeoCode: true,
} as const;

function marketView(location: {
  canonicalKey: string;
  cityName: string | null;
  countryCode: string;
  displayName: string;
  hl: string;
  kind: "country" | "region" | "city";
  languageCode: string;
  languageLabel: string;
  primaryGeoCode: number | null;
}) {
  const market = domainOverviewCountryMarket(location);
  return {
    canonicalKey: market.canonicalKey,
    cityName: market.cityName,
    countryCode: market.countryCode,
    displayName: market.displayName,
    kind: market.kind,
    languageCode: market.languageCode,
    languageLabel: market.languageLabel,
    locationCode: market.researchAvailable ? market.locationCode : null,
    regionName: market.regionName,
  };
}

export async function getDomainOverviewMarket(projectId: string, canonicalKey: string) {
  await requireReadableProject(projectId);
  const location = await prisma.location.findUnique({
    select: domainOverviewMarketSelect,
    where: { canonicalKey },
  });
  return location ? marketView(location) : null;
}

export async function getDomainOverviewPageContext(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const [details, fallbackLocation, recentTargets, costContext] = await Promise.all([
    prisma.project.findUnique({
      select: {
        competitors: { orderBy: { createdAt: "asc" }, select: { domain: true } },
        defaults: {
          select: {
            locationRef: {
              select: domainOverviewMarketSelect,
            },
          },
        },
        markets: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { location: { select: domainOverviewMarketSelect } },
          where: { status: { in: ["active", "paused"] } },
        },
        providerConnections: {
          orderBy: [{ priority: "asc" }, { provider: "asc" }],
          select: { provider: true, status: true },
          where: { enabled: true, kind: "serp" },
        },
      },
      where: { id: project.id },
    }),
    prisma.location.findUnique({
      select: domainOverviewMarketSelect,
      where: { canonicalKey: "US" },
    }),
    recentDomainOverviewTargets(project.id),
    getProjectCostContext(project.publicId),
  ]);
  if (!details) throw new Error("Project not found.");
  const location = details.defaults?.locationRef ?? fallbackLocation;
  const trackedMarkets = domainOverviewTrackedMarkets(
    details.markets.map((market) => market.location),
  );
  const trackedKeys = new Set(trackedMarkets.map((market) => market.canonicalKey));

  return {
    catalogMarkets: domainOverviewCatalogMarkets().filter(
      (market) => !trackedKeys.has(market.canonicalKey),
    ),
    competitorDomains: details.competitors.map((competitor) => competitor.domain),
    costContext,
    defaultMarket: location ? marketView(location) : null,
    defaultTarget: trackedProjectDomain(project.domain) ?? "",
    providerStatus: providerStatus(details.providerConnections),
    recentTargets,
    trackedMarkets,
  };
}
