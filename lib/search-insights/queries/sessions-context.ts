import "server-only";

import { prisma } from "@/lib/db/prisma";
import { addDays, dateKey, type FinalizedWindow } from "@/lib/search-insights/dates";
import type { SearchSyncStatusTitle } from "@/lib/search-insights/sync/control-model";
import { resolveOrganicSessionsProperty } from "@/lib/search-insights/sync/sessions-credentials";
import type { ImportObservabilityFacts } from "./import-observability";

export type SearchInsightsImportState = {
  availabilityBoundarySource?: "fallback" | "metadata" | null;
  capHitDays: number;
  cursorDate: string | null;
  createdAt?: string | null;
  daysDone: number;
  daysTotal: number;
  earliestTargetDate: string | null;
  facts?: ImportObservabilityFacts | null;
  finalizedThroughDate: string | null;
  firstDataDate?: string | null;
  lastProbeAt: string | null;
  lastSyncStartedAt: string | null;
  newestFinalizedDate: string | null;
  plannedRetentionMonths?: number | null;
  pausedReason: string | null;
  safeError?: string | null;
  pauseStartedAt?: string | null;
  pausedById?: string | null;
  state: string;
  updatedAt?: string | null;
};

export type OrganicSessionsContext = {
  importState: SearchInsightsImportState | null;
  keyEventsConfigured: boolean | null;
  property: string | null;
  status: "connected" | "needs_reauth" | "not_connected";
};

/** A client-safe slot for a connected GA4 source whose compared sessions are not readable yet. */
export type OrganicSessionsPendingPresentation = {
  kind: "pending";
  label: string;
  readyIn: string | null;
  reason: string;
  source: "GA4";
  status: SearchSyncStatusTitle | "Waiting for today's GA4 data";
};

export function importStateView(
  row: {
    availabilityBoundarySource?: string | null;
    capHitDays: number;
    cursorDate: Date | null;
    createdAt?: Date | null;
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
    updatedAt?: Date | null;
  },
  facts: ImportObservabilityFacts | null = null,
): SearchInsightsImportState {
  return {
    availabilityBoundarySource:
      row.availabilityBoundarySource === "metadata" || row.availabilityBoundarySource === "fallback"
        ? row.availabilityBoundarySource
        : null,
    capHitDays: row.capHitDays,
    cursorDate: row.cursorDate ? dateKey(row.cursorDate) : null,
    createdAt: row.createdAt?.toISOString() ?? null,
    daysDone: row.daysDone,
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate ? dateKey(row.earliestTargetDate) : null,
    facts,
    finalizedThroughDate: row.finalizedThroughDate ? dateKey(row.finalizedThroughDate) : null,
    firstDataDate: row.firstDataDate ? dateKey(row.firstDataDate) : null,
    lastProbeAt: row.lastProbeAt?.toISOString() ?? null,
    lastSyncStartedAt: row.lastSyncStartedAt?.toISOString() ?? null,
    newestFinalizedDate: row.newestFinalizedDate ? dateKey(row.newestFinalizedDate) : null,
    plannedRetentionMonths: row.plannedRetentionMonths ?? null,
    pausedReason: row.pausedReason,
    safeError: row.lastError ?? null,
    pauseStartedAt: row.pauseStartedAt?.toISOString() ?? null,
    pausedById: row.pausedById ?? null,
    state: row.state,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export function organicSessionsImportCoversWindow(
  importState: SearchInsightsImportState | null,
  window: FinalizedWindow,
  comparesPrevious = true,
) {
  if (!importState?.finalizedThroughDate) return false;
  if (importState.finalizedThroughDate < window.current.end) return false;
  const oldestStoredDate =
    importState.state === "completed"
      ? importState.earliestTargetDate
      : importState.cursorDate
        ? addDays(importState.cursorDate, 1)
        : null;
  const earliestRequiredDate = comparesPrevious ? window.previous.start : window.current.start;
  return Boolean(oldestStoredDate && oldestStoredDate <= earliestRequiredDate);
}

export function organicSessionsPropertyForWindow(
  context: OrganicSessionsContext,
  window: FinalizedWindow,
  comparesPrevious = true,
) {
  return context.status === "connected" && context.property
    ? organicSessionsImportCoversWindow(context.importState, window, comparesPrevious)
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
  if (!connection)
    return {
      importState: null,
      keyEventsConfigured: null,
      property: null,
      status: "not_connected",
    };
  if (!connection.enabled)
    return {
      importState: null,
      keyEventsConfigured: null,
      property: null,
      status: "not_connected",
    };

  const resolved = resolveOrganicSessionsProperty(connection);
  const property = resolved?.property ?? null;
  const importRow = property
    ? await prisma.searchAnalyticsImport.findUnique({
        where: { projectId_property_source: { projectId, property, source: "ga4" } },
      })
    : null;
  return {
    importState: importRow ? importStateView(importRow) : null,
    keyEventsConfigured: importRow?.keyEventsConfigured ?? null,
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
    keyEventsConfigured: importRow?.keyEventsConfigured ?? null,
    property,
    status: importRow ? "connected" : "not_connected",
  };
}
