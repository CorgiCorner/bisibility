import "server-only";

import { snapshotProvider } from "@/lib/backlinks/stored";
import { prisma } from "@/lib/db/prisma";
import { getSerpProvider, serpProviderCapabilities } from "@/lib/providers/registry";
import { providerChainOrderBy } from "@/lib/rank-check/provider-chain-order";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";
import { getProjectCostContext } from "./cost-calculator";

function recentResultLimit(fetchedRowCount: number) {
  if (fetchedRowCount >= 1000) return 1000 as const;
  if (fetchedRowCount >= 500) return 500 as const;
  if (fetchedRowCount >= 300) return 300 as const;
  return 100 as const;
}

export async function getBacklinksPageContext(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const [recentSnapshots, costContext, providerConnections] = await Promise.all([
    prisma.backlinkSnapshot.findMany({
      orderBy: { fetchedAt: "desc" },
      select: {
        expiresAt: true,
        fetchedAt: true,
        fetchedRowCount: true,
        includeSubdomains: true,
        summary: true,
        target: true,
        targetScope: true,
      },
      take: 50,
      where: { projectId: project.id },
    }),
    getProjectCostContext(project.publicId),
    prisma.providerConnection.findMany({
      orderBy: providerChainOrderBy(),
      select: { provider: true, status: true },
      where: { enabled: true, kind: "serp", projectId: project.id },
    }),
  ]);
  const capableConnections = providerConnections.filter((connection) => {
    if (!serpProviderCapabilities(connection.provider)?.backlinks) return false;
    const provider = getSerpProvider(connection.provider);
    return Boolean(
      provider.fetchBacklinksSummary &&
        provider.fetchBacklinksHistory &&
        provider.fetchBacklinksRows,
    );
  });
  const providers = [
    ...new Set(
      capableConnections
        .filter((connection) => connection.status === "connected")
        .map((connection) => connection.provider),
    ),
  ].map((id) => ({ label: getSerpProvider(id).label, value: id }));
  const seen = new Set<string>();
  const recentTargets = recentSnapshots
    .flatMap((snapshot) => {
      const provider = snapshotProvider(snapshot.summary);
      const key = JSON.stringify([
        snapshot.target,
        snapshot.targetScope,
        snapshot.includeSubdomains,
        provider,
      ]);
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          cachedUntil: snapshot.expiresAt.toISOString(),
          fetchedAt: snapshot.fetchedAt.toISOString(),
          includeSubdomains: snapshot.includeSubdomains,
          provider,
          resultLimit: recentResultLimit(snapshot.fetchedRowCount),
          target: snapshot.target,
          targetScope: snapshot.targetScope === "page" ? ("page" as const) : ("site" as const),
        },
      ];
    })
    .slice(0, 5);
  const providerStatus: "connected" | "needs_reauth" | "no_provider" = capableConnections.some(
    (connection) => connection.status === "connected",
  )
    ? "connected"
    : capableConnections.some((connection) => connection.status === "needs_reauth")
      ? "needs_reauth"
      : "no_provider";

  return {
    costContext,
    defaultTarget: trackedProjectDomain(project.domain) ?? "",
    providerStatus,
    providers,
    recentTargets,
  };
}
