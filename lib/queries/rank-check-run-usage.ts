import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { RunUsageGroup } from "@/lib/rank-check/runs/usage";

export async function rankCheckRunUsageGroups(runIds: string[]) {
  const byRun = new Map<string, RunUsageGroup[]>();
  if (runIds.length === 0) return byRun;
  const groups = await prisma.rankCheck.groupBy({
    by: ["runId", "provider", "requestedDepth"],
    _count: { _all: true, billingUnits: true },
    _sum: { billingUnits: true },
    where: { runId: { in: runIds } },
  });
  for (const group of groups) {
    if (group.runId === null) continue;
    const existing = byRun.get(group.runId) ?? [];
    existing.push(group);
    byRun.set(group.runId, existing);
  }
  return byRun;
}
