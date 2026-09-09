import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recentDomainOverviewTargets } from "@/lib/domain-overview/recent";
import {
  domainOverviewCatalogScopes,
  domainOverviewTrackedScopes,
} from "@/lib/domain-overview/scope-options";
import { serpProviderCapabilities } from "@/lib/providers/registry";
import { researchScopeForLocation, researchScopeKey } from "@/lib/research/scope";
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

const domainOverviewLocationSelect = {
  countryCode: true,
  languageCode: true,
  languageLabel: true,
} as const;

function scopeForLocation(location: {
  countryCode: string;
  languageCode: string;
  languageLabel: string;
}) {
  return researchScopeForLocation(location);
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
              select: domainOverviewLocationSelect,
            },
          },
        },
        markets: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { location: { select: domainOverviewLocationSelect } },
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
      select: domainOverviewLocationSelect,
      where: { canonicalKey: "US" },
    }),
    recentDomainOverviewTargets(project.id),
    getProjectCostContext(project.publicId),
  ]);
  if (!details) throw new Error("Project not found.");
  const location = details.defaults?.locationRef ?? fallbackLocation;
  const trackedScopes = domainOverviewTrackedScopes(details.markets.map((entry) => entry.location));
  const trackedKeys = new Set(trackedScopes.map(researchScopeKey));

  return {
    catalogScopes: domainOverviewCatalogScopes().filter(
      (scope) => !trackedKeys.has(researchScopeKey(scope)),
    ),
    competitorDomains: details.competitors.map((competitor) => competitor.domain),
    costContext,
    defaultScope: location ? scopeForLocation(location) : null,
    defaultTarget: trackedProjectDomain(project.domain) ?? "",
    providerStatus: providerStatus(details.providerConnections),
    recentTargets,
    trackedScopes,
  };
}
