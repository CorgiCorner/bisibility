import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { pacificQuotaDayRange } from "@/lib/search-insights/dates";
import * as importObservabilityDb from "@/lib/search-insights/queries/import-observability-db";
import { readSearchImportQueueFacts } from "@/lib/search-insights/queries/import-queue";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import {
  resolveSearchSyncSettings,
  searchSyncPreflightPlan,
} from "@/lib/settings/search-sync-config";
import { deriveSearchSyncMetrics } from "@/lib/settings/search-sync-metrics-model";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";

export async function loadSearchSyncMetrics(
  projectId: string,
  property: string | null,
  settings: ReturnType<typeof resolveSearchSyncSettings>,
  now = new Date(),
) {
  if (!property)
    return {
      firstDataDate: null,
      lastActivityAt: null,
      lastQuotaPausedAt: null,
      newestFinalizedDate: null,
      pauseStartedAt: null,
      pausedReason: null,
      observability: undefined,
      safeError: null,
      queue: undefined,
      runtime: undefined,
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
  const [observability, queue, workerLiveness] = await Promise.all([
    row
      ? importObservabilityDb.readImportObservability({
          daysTotal: row.daysTotal,
          earliestTargetDate: row.earliestTargetDate,
          lastProbeAt: row.lastProbeAt,
          newestFinalizedDate: row.newestFinalizedDate,
          plannedRetentionMonths: settings.retentionMonths,
          projectId,
          property,
          requestSetsPerHour: searchSyncRequestSetsPerHour(settings.pace),
        })
      : null,
    row
      ? readSearchImportQueueFacts({
          createdAt: row.createdAt,
          id: row.id,
          projectId,
          state: row.state,
        })
      : null,
    getWorkerLivenessDetails(),
  ]);
  return {
    ...deriveSearchSyncMetrics({
      daysDone: row?.daysDone ?? 0,
      daysTotal: row?.daysTotal ?? 0,
      lastQuotaPausedAt: row?.lastQuotaPausedAt ?? null,
      planned: Boolean(row?.earliestTargetDate),
      requestsToday: usage,
    }),
    firstDataDate: row?.firstDataDate ?? null,
    lastActivityAt: row?.updatedAt ?? null,
    newestFinalizedDate: row?.newestFinalizedDate ?? null,
    pauseStartedAt: row?.pauseStartedAt ?? null,
    pausedReason: row?.pausedReason ?? null,
    observability: observability ?? undefined,
    queue: queue ?? undefined,
    runtime: {
      workerStatus: {
        status: workerLiveness.status,
        temporalIdentityComparison: compareWorkerTemporalIdentity(
          temporalDeploymentConfig(),
          workerLiveness,
        ),
      },
    },
    safeError: row?.lastError ?? null,
    state: row?.state ?? null,
  };
}

export async function loadSearchSyncPreflightPlan(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const defaults = await getRequestProjectDefaults(project.id);
  return searchSyncPreflightPlan(resolveSearchSyncSettings(defaults));
}
