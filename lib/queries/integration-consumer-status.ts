import "server-only";

import { prisma } from "@/lib/db/prisma";
import { providerAgeLabel } from "@/lib/integrations/provider-age";
import { searchModuleConsumerStatus } from "@/lib/integrations/provider-consumer-status";
import type { IntegrationProviderData, ProviderStatusKind } from "@/lib/integrations/types";
import { readImportObservability } from "@/lib/search-insights/queries/import-observability-db";

type Connection = { lastUsedAt: Date | null; provider: string; status: ProviderStatusKind };
type ConsumerStatuses = IntegrationProviderData["consumerStatuses"];

export async function loadGscConsumerStatuses(
  projectId: string,
  connections: readonly Connection[],
  now: Date,
): Promise<ConsumerStatuses> {
  const connection = connections.find((row) => row.provider === "gsc");
  const active = await prisma.searchInsightsPropertyRegistry.findFirst({
    select: { propertyKey: true },
    where: { projectId, status: "active" },
  });
  const property = active?.propertyKey ?? null;
  const importRow = property
    ? await prisma.searchAnalyticsImport.findUnique({
        where: { projectId_property_source: { projectId, property, source: "gsc" } },
      })
    : null;
  const observability =
    importRow && property
      ? await readImportObservability({
          daysTotal: importRow.daysTotal,
          earliestTargetDate: importRow.earliestTargetDate,
          newestFinalizedDate: importRow.newestFinalizedDate,
          now,
          projectId,
          property,
        })
      : null;
  return {
    searchModule: searchModuleConsumerStatus({
      accountStatus: connection?.status ?? "ready",
      completedDays: observability?.completedDays ?? 0,
      daysTotal: importRow?.daysTotal ?? 0,
      firstViewReady: observability?.firstViewReady ?? false,
      importState: importRow?.state ?? null,
      pausedReason: importRow?.pausedReason ?? null,
      plannedRetentionMonths: importRow?.plannedRetentionMonths ?? null,
      property,
    }),
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
