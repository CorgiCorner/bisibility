import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "@/lib/queries/_auth";
import { pacificQuotaDayRange } from "@/lib/search-insights/dates";
import {
  resolveSearchSyncSettings,
  searchSyncPreflightPlan,
} from "@/lib/settings/search-sync-config";
import { deriveSearchSyncMetrics } from "@/lib/settings/search-sync-metrics-model";

export async function loadSearchSyncMetrics(
  projectId: string,
  property: string | null,
  now = new Date(),
) {
  if (!property)
    return {
      lastActivityAt: null,
      lastQuotaPausedAt: null,
      pauseStartedAt: null,
      pausedReason: null,
      safeError: null,
      state: null,
      plannedRemaining: 0,
      requestsToday: 0,
    };
  const quotaDay = pacificQuotaDayRange(now);
  const [row, usage] = await Promise.all([
    prisma.searchAnalyticsImport.findUnique({
      where: { projectId_property_source: { projectId, property, source: "gsc" } },
    }),
    prisma.searchAnalyticsRequestUsage.count({
      where: { attemptedAt: { gte: quotaDay.start, lt: quotaDay.end }, projectId, property },
    }),
  ]);
  return {
    ...deriveSearchSyncMetrics({
      daysDone: row?.daysDone ?? 0,
      daysTotal: row?.daysTotal ?? 0,
      lastQuotaPausedAt: row?.lastQuotaPausedAt ?? null,
      planned: Boolean(row?.earliestTargetDate),
      requestsToday: usage,
    }),
    lastActivityAt: row?.updatedAt ?? null,
    pauseStartedAt: row?.pauseStartedAt ?? null,
    pausedReason: row?.pausedReason ?? null,
    safeError: row?.lastError ?? null,
    state: row?.state ?? null,
  };
}

export async function loadSearchSyncPreflightPlan(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const defaults = await prisma.projectDefaults.findUnique({ where: { projectId: project.id } });
  return searchSyncPreflightPlan(resolveSearchSyncSettings(defaults));
}
