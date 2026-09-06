import "server-only";

import type { DateFormat } from "@/lib/dates/format";
import { prisma } from "@/lib/db/prisma";
import { providerAgeLabel } from "@/lib/integrations/provider-age";
import { searchModuleConsumerStatus } from "@/lib/integrations/provider-consumer-status";
import type { IntegrationProviderData, ProviderStatusKind } from "@/lib/integrations/types";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { readImportObservability } from "@/lib/search-insights/queries/import-observability-db";
import { readSearchImportQueueFacts } from "@/lib/search-insights/queries/import-queue";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";

type Connection = { lastUsedAt: Date | null; provider: string; status: ProviderStatusKind };
type ConsumerStatuses = IntegrationProviderData["consumerStatuses"];

export async function loadGscConsumerStatuses(
  projectId: string,
  connections: readonly Connection[],
  now: Date,
  dateFormat: DateFormat = "month_first",
): Promise<ConsumerStatuses> {
  const connection = connections.find((row) => row.provider === "gsc");
  const active = await prisma.searchInsightsPropertyRegistry.findFirst({
    select: { propertyKey: true },
    where: { projectId, status: "active" },
  });
  const property = active?.propertyKey ?? null;
  const connectionStatus =
    connection?.status === "needs_reauth"
      ? "needs_reauth"
      : connection
        ? property
          ? "connected"
          : "connected_no_property"
        : "not_connected";
  const [importRow, defaults] = property
    ? await Promise.all([
        prisma.searchAnalyticsImport.findUnique({
          where: { projectId_property_source: { projectId, property, source: "gsc" } },
        }),
        prisma.projectDefaults.findUnique({ where: { projectId } }),
      ])
    : [null, null];
  const settings = resolveSearchSyncSettings(defaults);
  const [observability, queue, workerLiveness] =
    importRow && property
      ? await Promise.all([
          readImportObservability({
            daysTotal: importRow.daysTotal,
            earliestTargetDate: importRow.earliestTargetDate,
            lastProbeAt: importRow.lastProbeAt,
            newestFinalizedDate: importRow.newestFinalizedDate,
            now,
            plannedRetentionMonths: settings.retentionMonths,
            projectId,
            property,
            requestSetsPerHour: searchSyncRequestSetsPerHour(settings.pace),
          }),
          readSearchImportQueueFacts({
            createdAt: importRow.createdAt,
            id: importRow.id,
            projectId,
            state: importRow.state,
          }),
          getWorkerLivenessDetails(),
        ])
      : [null, null, null];
  return {
    searchModule: searchModuleConsumerStatus(
      {
        connectionStatus,
        observability: observability ?? undefined,
        pausedReason: importRow?.pausedReason ?? null,
        property,
        pauseStartedAt: importRow?.pauseStartedAt?.toISOString() ?? null,
        queue: queue ?? undefined,
        runtime: workerLiveness
          ? {
              workerStatus: {
                status: workerLiveness.status,
                temporalIdentityComparison: compareWorkerTemporalIdentity(
                  temporalDeploymentConfig(),
                  workerLiveness,
                ),
              },
            }
          : undefined,
        safeError: importRow?.lastError ?? null,
        state: importRow?.state ?? null,
      },
      dateFormat,
    ),
    trafficEnrichment:
      connection?.status === "needs_reauth"
        ? { state: "needs_reauth", summary: "Needs reconnect" }
        : connection?.lastUsedAt
          ? {
              state: "last_synced",
              summary: `Last synced ${providerAgeLabel(connection.lastUsedAt, now)}`,
            }
          : connection
            ? { state: "never_synced", summary: "Never synced" }
            : { state: "not_configured", summary: "Not configured" },
  };
}
