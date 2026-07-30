import "server-only";

import { prisma } from "@/lib/db/prisma";
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
  const [recentSnapshots, costContext] = await Promise.all([
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
  ]);

  return {
    costContext,
    defaultTarget: project.domain,
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
