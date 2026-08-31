import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma, type SearchAnalyticsImport } from "@/lib/generated/prisma/client";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { requireReadableProject } from "@/lib/queries/_auth";
import {
  resolveSearchInsightsConnectionState,
  type SearchInsightsConnectionStatus,
} from "@/lib/search-insights/connection-state";
import {
  type DateWindow,
  dateKey,
  type FinalizedWindow,
  finalizedWindow,
} from "@/lib/search-insights/dates";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import {
  resolvePeriod,
  type SearchInsightsPeriod,
  type SearchInsightsProperty,
  type SearchInsightsYoy,
  searchInsightsProperty,
  yoyState,
} from "./context-model";
import { readImportObservability } from "./import-observability-db";
import {
  importStateView,
  type OrganicSessionsContext,
  readOrganicSessionsContext,
  readStoredOrganicSessionsContext,
  type SearchInsightsImportState,
} from "./sessions-context";
import { searchInsightsWindowFilter } from "./window-filter";

export type { SearchInsightsPeriod, SearchInsightsProperty } from "./context-model";

export type SearchInsightsPropertyView = "active" | "archived";

export type SearchInsightsConnection = {
  property: SearchInsightsProperty | null;
  status: SearchInsightsConnectionStatus;
};

export type { SearchInsightsImportState } from "./sessions-context";

export type SearchInsightsCounts = {
  pages: number;
  queries: number;
};

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
  importRow: SearchAnalyticsImport | null;
  organicSessions: OrganicSessionsContext;
  period: SearchInsightsPeriod;
  projectDomain: string;
  projectId: string;
  property: string | null;
  view: SearchInsightsPropertyView;
  window: FinalizedWindow | null;
};

export type SearchInsightsViewOptions = {
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

/**
 * COUNT(DISTINCT ...) stays in the database: the module only needs the two numbers, and the
 * grouped rows behind them run to tens of thousands on a 90 day window. The page count belongs
 * to the first view, not to the context bar, and rides this statement so switching a property
 * costs one round trip instead of two.
 */
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

async function readCounts(
  projectId: string,
  property: string,
  current: DateWindow,
): Promise<SearchInsightsCounts> {
  const filter = searchInsightsWindowFilter(projectId, property, current);
  const rows = await prisma.$queryRaw<{ pages: bigint; queries: bigint }[]>(Prisma.sql`
    SELECT
      (
        SELECT COUNT(DISTINCT "keyHash")
        FROM "search_analytics_page_daily"
        WHERE ${filter}
      ) AS "pages",
      (
        SELECT COUNT(DISTINCT "keyHash")
        FROM "search_analytics_query_daily"
        WHERE ${filter}
      ) AS "queries"
  `);
  const row = rows.at(0);
  return { pages: Number(row?.pages ?? 0), queries: Number(row?.queries ?? 0) };
}

export async function loadSearchInsightsScope(
  projectRef: string,
  options: SearchInsightsViewOptions = {},
): Promise<SearchInsightsScope> {
  const { project } = await requireReadableProject(projectRef);
  const period = resolvePeriod(options.period);
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
        : { importState: null, property: null, status: "not_connected" as const };

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

  const observability =
    importRow && property && selection.view === "active"
      ? await readImportObservability({
          daysTotal: importRow.daysTotal,
          earliestTargetDate: importRow.earliestTargetDate,
          newestFinalizedDate: importRow.newestFinalizedDate,
          projectId: project.id,
          property,
        })
      : null;
  const localReadableThrough = observability?.localReadableThrough
    ? observability.localReadableThrough
    : selection.view === "archived" && importRow?.finalizedThroughDate
      ? dateKey(importRow.finalizedThroughDate)
      : null;
  return {
    connection,
    importRow,
    organicSessions,
    period,
    projectDomain: project.domain ?? "",
    projectId: project.id,
    property,
    view: selection.view,
    window: localReadableThrough ? finalizedWindow(localReadableThrough, period.days) : null,
  };
}

export async function getSearchInsightsContext(
  projectRef: string,
  options: ScopedOptions = {},
): Promise<SearchInsightsContext> {
  const scope = options.scope ?? (await loadSearchInsightsScope(projectRef, options));
  const counts =
    scope.property && scope.window
      ? await readCounts(scope.projectId, scope.property, scope.window.current)
      : { pages: 0, queries: 0 };

  return {
    connection: scope.connection,
    counts,
    importState: scope.importRow
      ? importStateView(
          scope.importRow,
          scope.property
            ? await readImportObservability({
                daysTotal: scope.importRow.daysTotal,
                earliestTargetDate: scope.importRow.earliestTargetDate,
                newestFinalizedDate: scope.importRow.newestFinalizedDate,
                projectId: scope.projectId,
                property: scope.property,
              })
            : undefined,
        )
      : null,
    organicSessions: scope.organicSessions,
    period: scope.period,
    projectDomain: scope.projectDomain,
    selectedProperty: scope.property ? searchInsightsProperty(scope.property) : null,
    view: scope.view,
    window: scope.window,
    yoy: yoyState(scope.importRow),
  };
}
