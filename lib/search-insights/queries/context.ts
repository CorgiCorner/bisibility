import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { SearchAnalyticsImport } from "@/lib/generated/prisma/client";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import {
  resolveSearchInsightsConnectionState,
  type SearchInsightsConnectionStatus,
} from "@/lib/search-insights/connection-state";
import { FIRST_LOOK_WINDOW, WINDOW_PRESETS } from "@/lib/search-insights/constants";
import { dateKey, type FinalizedWindow, finalizedWindow } from "@/lib/search-insights/dates";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import {
  resolveComparisonMode,
  resolvePeriod,
  type SearchInsightsPeriod,
  type SearchInsightsProperty,
  type SearchInsightsYoy,
  searchInsightsProperty,
  yoyState,
} from "./context-model";
import { getWindowCounts, type SearchInsightsCounts } from "./counts";
import type { ImportObservabilityFacts } from "./import-observability";
import * as importObservabilityDb from "./import-observability-db";
import { readSearchImportQueueFacts, type SearchImportQueueFacts } from "./import-queue";
import {
  importStateView,
  type OrganicSessionsContext,
  readOrganicSessionsContext,
  readStoredOrganicSessionsContext,
  type SearchInsightsImportState,
} from "./sessions-context";
import { readWindowFacts } from "./window-facts";

export type { SearchInsightsPeriod, SearchInsightsProperty } from "./context-model";

export type SearchInsightsPropertyView = "active" | "archived";

export type SearchInsightsConnection = {
  property: SearchInsightsProperty | null;
  status: SearchInsightsConnectionStatus;
};

export type { SearchInsightsCounts } from "./counts";
export type { SearchInsightsImportState } from "./sessions-context";

export type SearchInsightsContext = {
  connection: SearchInsightsConnection;
  counts: SearchInsightsCounts;
  importState: SearchInsightsImportState | null;
  organicSessions: OrganicSessionsContext;
  period: SearchInsightsPeriod;
  projectDomain: string;
  selectedProperty: SearchInsightsProperty | null;
  view: SearchInsightsPropertyView;
  window: FinalizedWindow | null;
  yoy: SearchInsightsYoy;
};

/** The property and the finalized window: what every read of the module starts from. */
export type SearchInsightsScope = {
  connection: SearchInsightsConnection;
  importFacts: ImportObservabilityFacts | null;
  importRow: SearchAnalyticsImport | null;
  organicSessions: OrganicSessionsContext;
  period: SearchInsightsPeriod;
  projectDomain: string;
  projectId: string;
  property: string | null;
  queue: SearchImportQueueFacts | null;
  view: SearchInsightsPropertyView;
  window: FinalizedWindow | null;
};

export type SearchInsightsViewOptions = {
  comparison?: string;
  period?: string;
  /** A stored, non-active GSC property to render without mutating the connection. */
  property?: string;
};

/**
 * A read that can take a scope the caller already resolved. Loading one repeats the project
 * authorization, the stored credential decrypt and the import lookup, and the page needs the
 * same scope for the context bar and for the first view.
 */
export type ScopedOptions = SearchInsightsViewOptions & {
  scope?: SearchInsightsScope;
};

async function readConnection(projectId: string): Promise<SearchInsightsConnection> {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, status: true },
    where: { projectId_provider: { projectId, provider: SEARCH_INSIGHTS_SOURCE } },
  });
  if (!connection) return { property: null, status: "not_connected" };

  let stored: string | undefined;
  try {
    stored = decryptProviderCredentials(connection.credentialsEncrypted).login;
  } catch {
    stored = undefined;
  }
  const state = resolveSearchInsightsConnectionState({
    providerStatus: connection.status,
    storedProperty: stored,
  });
  return {
    property: state.propertyKey ? searchInsightsProperty(state.propertyKey) : null,
    status: state.status,
  };
}

async function resolvePropertyView(
  projectId: string,
  activeProperty: string | null,
  requestedProperty: string | undefined,
) {
  const requested = requestedProperty ? searchInsightsPropertyKey(requestedProperty) : null;
  if (!requested || requested === activeProperty) {
    return { ga4PropertyId: null, property: activeProperty, view: "active" as const };
  }
  const archived = await prisma.searchInsightsPropertyRegistry.findFirst({
    select: { ga4PropertyId: true, propertyKey: true },
    where: { projectId, propertyKey: requested, status: "archived" },
  });
  return archived
    ? {
        ga4PropertyId: archived.ga4PropertyId,
        property: archived.propertyKey,
        view: "archived" as const,
      }
    : { ga4PropertyId: null, property: activeProperty, view: "active" as const };
}

function readyImportPeriod(
  raw: string | undefined,
  facts: ImportObservabilityFacts | null,
  comparison: SearchInsightsPeriod["comparison"],
) {
  const ready = facts
    ? {
        "7": facts.readyThrough.d7.current,
        "28": facts.readyThrough.d28.current,
        "90": facts.readyThrough.d90.current,
      }
    : null;
  const requested = WINDOW_PRESETS.find(({ id }) => id === raw);
  const preset =
    requested && ready?.[requested.id]
      ? requested
      : [...WINDOW_PRESETS].reverse().find(({ id }) => ready?.[id]);
  if (preset) return resolvePeriod(preset.id, comparison);
  return facts?.readyThrough.d1.current
    ? { ...FIRST_LOOK_WINDOW, comparison }
    : resolvePeriod("7", comparison);
}

export async function loadSearchInsightsScope(
  projectRef: string,
  options: SearchInsightsViewOptions = {},
): Promise<SearchInsightsScope> {
  const { project } = await requireReadableProject(projectRef);
  const connection = await readConnection(project.id);
  const selection = await resolvePropertyView(
    project.id,
    connection.property?.value ?? null,
    options.property,
  );
  const property = selection.property;
  const organicSessions =
    selection.view === "active"
      ? await readOrganicSessionsContext(project.id)
      : selection.ga4PropertyId
        ? await readStoredOrganicSessionsContext(project.id, selection.ga4PropertyId)
        : {
            importState: null,
            keyEventsConfigured: null,
            property: null,
            status: "not_connected" as const,
          };

  const importRow = property
    ? await prisma.searchAnalyticsImport.findUnique({
        where: {
          projectId_property_source: {
            projectId: project.id,
            property,
            source: SEARCH_INSIGHTS_SOURCE,
          },
        },
      })
    : null;

  const settings =
    importRow && property && selection.view === "active"
      ? resolveSearchSyncSettings(await getRequestProjectDefaults(project.id))
      : null;
  const [importFacts, queue] = await Promise.all([
    importRow && property && settings
      ? importObservabilityDb.readImportObservability({
          daysTotal: importRow.daysTotal,
          earliestTargetDate: importRow.earliestTargetDate,
          lastProbeAt: importRow.lastProbeAt,
          newestFinalizedDate: importRow.newestFinalizedDate,
          plannedRetentionMonths: settings.retentionMonths,
          projectId: project.id,
          property,
          requestSetsPerHour: searchSyncRequestSetsPerHour(settings.pace),
        })
      : null,
    importRow && selection.view === "active"
      ? readSearchImportQueueFacts({
          createdAt: importRow.createdAt,
          id: importRow.id,
          projectId: project.id,
          state: importRow.state,
        })
      : null,
  ]);
  const yoy = yoyState(importRow);
  const comparison = resolveComparisonMode(options.comparison, yoy);
  const period =
    selection.view === "active"
      ? readyImportPeriod(options.period, importFacts, comparison)
      : resolvePeriod(options.period, comparison);
  const localReadableThrough =
    selection.view === "active" &&
    importFacts?.readyThrough.d1.current &&
    importRow?.newestFinalizedDate
      ? dateKey(importRow.newestFinalizedDate)
      : selection.view === "archived" && importRow?.finalizedThroughDate
        ? dateKey(importRow.finalizedThroughDate)
        : null;
  return {
    connection,
    importFacts,
    importRow,
    organicSessions,
    period,
    projectDomain: project.domain ?? "",
    projectId: project.id,
    property,
    queue,
    view: selection.view,
    window: localReadableThrough
      ? finalizedWindow(localReadableThrough, period.days, period.comparison)
      : null,
  };
}

/**
 * The window's query count, from the stored facts when the import has computed them.
 *
 * This sits in the page's blocking prefix, which is where the 400 ms budget is spent, and it is
 * the single most expensive statement there: 441 ms cold at 28 days and 1,173 ms at 90 on a
 * production-shaped instance. A miss falls through to the live count, so the number is always
 * right and only sometimes slow.
 */
async function countsForWindow(scope: SearchInsightsScope): Promise<SearchInsightsCounts> {
  if (!scope.property || !scope.window) return { queries: 0 };
  const read = await readWindowFacts({
    finalizedThrough: scope.window.current.end,
    projectId: scope.projectId,
    property: scope.property,
    windowDays: scope.period.days,
  });
  if (read.kind === "hit") return read.facts.counts;
  return getWindowCounts(scope.projectId, scope.property, scope.window.current);
}

export async function getSearchInsightsContext(
  projectRef: string,
  options: ScopedOptions = {},
): Promise<SearchInsightsContext> {
  const scope = options.scope ?? (await loadSearchInsightsScope(projectRef, options));
  const counts = scope.property && scope.window ? await countsForWindow(scope) : { queries: 0 };

  return {
    connection: scope.connection,
    counts,
    importState: scope.importRow ? importStateView(scope.importRow, scope.importFacts) : null,
    organicSessions: scope.organicSessions,
    period: scope.period,
    projectDomain: scope.projectDomain,
    selectedProperty: scope.property ? searchInsightsProperty(scope.property) : null,
    view: scope.view,
    window: scope.window,
    yoy: yoyState(scope.importRow),
  };
}
