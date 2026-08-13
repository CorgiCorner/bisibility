import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recentDomainOverviewTargets } from "@/lib/domain-overview/recent";
import { domainOverviewLocationCode } from "@/lib/domain-overview/target";
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
  languageLabel: string;
  primaryGeoCode: number | null;
}) {
  return {
    canonicalKey: location.canonicalKey,
    cityName: location.cityName,
    countryCode: location.countryCode,
    displayName: location.displayName,
    kind: location.kind,
    languageCode: location.hl,
    languageLabel: location.languageLabel,
    locationCode: domainOverviewLocationCode(location),
    regionName: null,
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

  return {
    competitorDomains: details.competitors.map((competitor) => competitor.domain),
    costContext,
    defaultMarket: location ? marketView(location) : null,
    defaultTarget: trackedProjectDomain(project.domain) ?? "",
    providerStatus: providerStatus(details.providerConnections),
    recentTargets,
  };
}
