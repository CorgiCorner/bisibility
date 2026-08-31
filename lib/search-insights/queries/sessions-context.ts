import "server-only";

import { prisma } from "@/lib/db/prisma";
import { addDays, dateKey, type FinalizedWindow } from "@/lib/search-insights/dates";
import { resolveOrganicSessionsProperty } from "@/lib/search-insights/sync/sessions-credentials";

export type SearchInsightsImportState = {
  availabilityBoundarySource?: "fallback" | "metadata" | null;
  capHitDays: number;
  cursorDate: string | null;
  daysDone: number;
  daysTotal: number;
  earliestTargetDate: string | null;
  finalizedThroughDate: string | null;
  firstDataDate?: string | null;
  lastActivityAt?: string | null;
  lastProbeAt: string | null;
  lastSyncStartedAt: string | null;
  newestFinalizedDate: string | null;
  plannedRetentionMonths?: number | null;
  pausedReason: string | null;
  safeError?: string | null;
  pauseStartedAt?: string | null;
  pausedById?: string | null;
  state: string;
  completedDays?: number;
  etaLabel?: string | null;
  firstViewReady?: boolean;
  localReadableThrough?: string | null;
  waiting?: boolean;
};

export type OrganicSessionsContext = {
  importState: SearchInsightsImportState | null;
  property: string | null;
  status: "connected" | "needs_reauth" | "not_connected";
};

export function importStateView(
  row: {
    availabilityBoundarySource?: string | null;
    capHitDays: number;
    cursorDate: Date | null;
    daysDone: number;
    daysTotal: number;
    earliestTargetDate: Date | null;
    finalizedThroughDate: Date | null;
    firstDataDate?: Date | null;
    lastProbeAt: Date | null;
    lastSyncStartedAt: Date | null;
    newestFinalizedDate: Date | null;
    plannedRetentionMonths?: number | null;
    pausedReason: string | null;
    lastError?: string | null;
    pauseStartedAt?: Date | null;
    pausedById?: string | null;
    state: string;
  },
  observability: {
    completedDays: number;
    etaLabel: string | null;
    firstViewReady: boolean;
    localReadableThrough: string | null;
    lastActivityAt: string | null;
    waiting: boolean;
  } = {
    completedDays: 0,
    etaLabel: null,
    firstViewReady: false,
    localReadableThrough: null,
    lastActivityAt: null,
    waiting: false,
  },
): SearchInsightsImportState {
  return {
    availabilityBoundarySource:
      row.availabilityBoundarySource === "metadata" || row.availabilityBoundarySource === "fallback"
        ? row.availabilityBoundarySource
        : null,
    capHitDays: row.capHitDays,
    cursorDate: row.cursorDate ? dateKey(row.cursorDate) : null,
    daysDone: row.daysDone,
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate ? dateKey(row.earliestTargetDate) : null,
    finalizedThroughDate: row.finalizedThroughDate ? dateKey(row.finalizedThroughDate) : null,
    firstDataDate: row.firstDataDate ? dateKey(row.firstDataDate) : null,
    lastActivityAt: observability.lastActivityAt,
    lastProbeAt: row.lastProbeAt?.toISOString() ?? null,
    lastSyncStartedAt: row.lastSyncStartedAt?.toISOString() ?? null,
    newestFinalizedDate: row.newestFinalizedDate ? dateKey(row.newestFinalizedDate) : null,
    plannedRetentionMonths: row.plannedRetentionMonths ?? null,
    pausedReason: row.pausedReason,
    safeError: row.lastError ?? null,
    pauseStartedAt: row.pauseStartedAt?.toISOString() ?? null,
    pausedById: row.pausedById ?? null,
    state: row.state,
    completedDays: observability.completedDays,
    etaLabel: observability.etaLabel,
    firstViewReady: observability.firstViewReady,
    localReadableThrough: observability.localReadableThrough,
    waiting: observability.waiting,
  };
}

export function organicSessionsImportCoversWindow(
  importState: SearchInsightsImportState | null,
  window: FinalizedWindow,
) {
  if (!importState?.finalizedThroughDate) return false;
  if (importState.finalizedThroughDate < window.current.end) return false;
  const oldestStoredDate =
    importState.state === "completed"
      ? importState.earliestTargetDate
      : importState.cursorDate
        ? addDays(importState.cursorDate, 1)
        : null;
  return Boolean(oldestStoredDate && oldestStoredDate <= window.previous.start);
}

export function organicSessionsPropertyForWindow(
  context: OrganicSessionsContext,
  window: FinalizedWindow,
) {
  return context.status === "connected" && context.property
    ? organicSessionsImportCoversWindow(context.importState, window)
      ? context.property
      : null
    : null;
}

export async function readOrganicSessionsContext(
  projectId: string,
): Promise<OrganicSessionsContext> {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, enabled: true, id: true, provider: true, status: true },
    where: { projectId_provider: { projectId, provider: "ga4" } },
  });
  if (!connection) return { importState: null, property: null, status: "not_connected" };
  if (!connection.enabled) return { importState: null, property: null, status: "not_connected" };

  const resolved = resolveOrganicSessionsProperty(connection);
  const property = resolved?.property ?? null;
  const importRow = property
    ? await prisma.searchAnalyticsImport.findUnique({
        where: { projectId_property_source: { projectId, property, source: "ga4" } },
      })
    : null;
  return {
    importState: importRow ? importStateView(importRow) : null,
    property,
    status:
      connection.status === "needs_reauth"
        ? "needs_reauth"
        : property
          ? "connected"
          : "not_connected",
  };
}

/** Resolve stored sessions for an archived GSC view without consulting today's GA4 connection. */
export async function readStoredOrganicSessionsContext(
  projectId: string,
  property: string,
): Promise<OrganicSessionsContext> {
  const importRow = await prisma.searchAnalyticsImport.findUnique({
    where: { projectId_property_source: { projectId, property, source: "ga4" } },
  });
  return {
    importState: importRow ? importStateView(importRow) : null,
    property,
    status: importRow ? "connected" : "not_connected",
  };
}
