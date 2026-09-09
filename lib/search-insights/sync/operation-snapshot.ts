import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { readGscCredentials } from "@/lib/providers/analytics/gsc-credentials";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { resolveSearchInsightsConnectionState } from "@/lib/search-insights/connection-state";
import { readImportObservability } from "@/lib/search-insights/queries/import-observability-db";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";
import {
  resolveSearchBackfillPresentation,
  type SearchBackfillKind,
  type SearchSyncControlAction,
  type SearchSyncStatusTitle,
  selectSearchImportCoverage,
} from "./control-model";
import { SEARCH_INSIGHTS_SOURCE } from "./credentials";

type ActiveSearchImportPresentation = Readonly<{
  action: SearchSyncControlAction;
  kind: SearchBackfillKind;
  supportingText: string | null;
  title: SearchSyncStatusTitle;
}>;

export type ActiveSearchImportSnapshot = Readonly<{
  capabilities: Readonly<{ pause: boolean; resume: boolean; retry: boolean }>;
  id: string;
  presentation: ActiveSearchImportPresentation;
  progress: Readonly<{ done: number | null; total: number | null }>;
  property: string;
  state: string;
}>;

function storedProperty(connection: { credentialsEncrypted: string | null } | null) {
  if (!connection?.credentialsEncrypted) return undefined;
  try {
    return readGscCredentials(decryptProviderCredentials(connection.credentialsEncrypted)).property;
  } catch {
    return undefined;
  }
}

function isTerminal(state: string) {
  return state === "completed" || state === "failed";
}

function capabilities(action: ActiveSearchImportPresentation["action"]) {
  return { pause: action === "pause", resume: action === "resume", retry: action === "retry" };
}

/**
 * The operations endpoint has one current GSC property per project. Reading that row first keeps
 * qualifying coverage to a single observation read rather than one query fan-out per import.
 */
export async function readActiveSearchImportSnapshot(
  projectId: string,
): Promise<ActiveSearchImportSnapshot | null> {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, enabled: true, status: true },
    where: { projectId_provider: { projectId, provider: SEARCH_INSIGHTS_SOURCE } },
  });
  const property = storedProperty(connection);
  if (!property) return null;

  const row = await prisma.searchAnalyticsImport.findUnique({
    where: { projectId_property_source: { projectId, property, source: SEARCH_INSIGHTS_SOURCE } },
  });
  if (!row || isTerminal(row.state)) return null;

  const connectionState = resolveSearchInsightsConnectionState({
    providerStatus: connection?.enabled ? connection.status : null,
    storedProperty: property,
  });
  const [defaults, workerLiveness] = await Promise.all([
    getRequestProjectDefaults(projectId),
    getWorkerLivenessDetails(),
  ]);
  const settings = resolveSearchSyncSettings(defaults);
  const observability = await readImportObservability({
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate,
    lastProbeAt: row.lastProbeAt,
    newestFinalizedDate: row.newestFinalizedDate,
    plannedRetentionMonths: settings.retentionMonths,
    projectId,
    property,
    requestSetsPerHour: searchSyncRequestSetsPerHour(settings.pace),
  });
  const runtime = {
    workerStatus: {
      status: workerLiveness.status,
      temporalIdentityComparison: compareWorkerTemporalIdentity(
        temporalDeploymentConfig(),
        workerLiveness,
      ),
    },
  };
  const model = resolveSearchBackfillPresentation({
    connectionStatus: connectionState.status,
    observability,
    pauseStartedAt: row.pauseStartedAt?.toISOString() ?? null,
    pausedReason: row.pausedReason,
    runtime,
    safeError: row.lastError,
    state: row.state,
  });
  const coverage = selectSearchImportCoverage({ observability });
  const presentation = {
    action: model.action,
    kind: model.kind,
    supportingText: model.supportingText,
    title: model.title,
  };
  return {
    capabilities: capabilities(model.action),
    id: row.id,
    presentation,
    progress: { done: coverage.completed, total: coverage.total },
    property,
    state: row.state,
  };
}
