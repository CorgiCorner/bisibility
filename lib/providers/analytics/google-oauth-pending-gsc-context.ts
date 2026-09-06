import "server-only";

import { prisma } from "@/lib/db/prisma";
import { dateKey } from "@/lib/search-insights/dates";

export async function pendingGscContext(projectId: string) {
  const [project, rows] = await Promise.all([
    prisma.project?.findUnique?.({ select: { domain: true }, where: { id: projectId } }) ??
      Promise.resolve(null),
    prisma.searchInsightsPropertyRegistry?.findMany?.({
      select: { propertyKey: true },
      where: { projectId, status: "archived" },
    }) ?? Promise.resolve([]),
  ]);
  const archivedProperties = await Promise.all(
    rows.map(async (row) => {
      const partition = await prisma.searchAnalyticsSyncPartition.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
        where: { projectId, property: row.propertyKey, source: "gsc" },
      });
      if (!partition) return null;
      const kind = row.propertyKey.startsWith("sc-domain:") ? "domain" : "url-prefix";
      return {
        kind,
        label: row.propertyKey.startsWith("sc-domain:")
          ? row.propertyKey.slice(10)
          : row.propertyKey,
        lastSyncedDate: dateKey(partition.date),
        permissionLevel: "",
        value: row.propertyKey,
      } as const;
    }),
  );
  return {
    archivedProperties: archivedProperties.filter((property) => property !== null),
    projectDomain: project?.domain ?? "",
  };
}
