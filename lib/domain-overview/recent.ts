import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { DomainOverviewScope, DomainRecentTarget } from "./types";

export async function recentDomainOverviewTargets(projectId: string, limit = 8, now = new Date()) {
  const rows = await prisma.domainOverviewSnapshot.findMany({
    orderBy: { fetchedAt: "desc" },
    select: {
      cachedUntil: true,
      fetchedAt: true,
      languageCode: true,
      locationCode: true,
      scope: true,
      target: true,
    },
    take: Math.max(limit * 8, limit),
    where: { cachedUntil: { gt: now }, projectId },
  });
  const seen = new Set<string>();
  const recent: DomainRecentTarget[] = [];
  for (const row of rows) {
    if (seen.has(row.target)) continue;
    seen.add(row.target);
    const scope: DomainOverviewScope = row.scope === "subdomain" ? "subdomain" : "root";
    recent.push({
      cachedUntil: row.cachedUntil.toISOString(),
      fetchedAt: row.fetchedAt.toISOString(),
      languageCode: row.languageCode,
      locationCode: row.locationCode,
      scope,
      target: row.target,
    });
    if (recent.length >= limit) break;
  }
  return recent;
}
