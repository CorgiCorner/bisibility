import "server-only";

import { prisma } from "@/lib/db/prisma";
import { serpProviderCapabilities } from "@/lib/providers/registry";
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
      distinct: ["target", "targetScope", "includeSubdomains"],
      orderBy: { fetchedAt: "desc" },
      select: {
        expiresAt: true,
        fetchedAt: true,
        fetchedRowCount: true,
        includeSubdomains: true,
        target: true,
        targetScope: true,
      },
      take: 5,
      where: { projectId: project.id },
    }),
    getProjectCostContext(project.publicId),
    prisma.providerConnection.findMany({
      select: { provider: true, status: true },
      where: { enabled: true, kind: "serp", projectId: project.id },
    }),
  ]);
  const capableConnections = providerConnections.filter(
    (connection) => serpProviderCapabilities(connection.provider)?.backlinks,
  );
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
    recentTargets: recentSnapshots.map((snapshot) => ({
      cachedUntil: snapshot.expiresAt.toISOString(),
      fetchedAt: snapshot.fetchedAt.toISOString(),
      includeSubdomains: snapshot.includeSubdomains,
      resultLimit: recentResultLimit(snapshot.fetchedRowCount),
      target: snapshot.target,
      targetScope: snapshot.targetScope === "page" ? ("page" as const) : ("site" as const),
    })),
  };
}
