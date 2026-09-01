import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { GscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import { dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import { fetchAggregateRange, probeFreshness } from "./aggregate";
import type { ImportRow } from "./import-state";
import { planBackfill } from "./plan";
import { USER_PAUSE_REASON, userPauseGuard } from "./user-pause";

export type BackfillPlanState = {
  cursorDate: string;
  /** Frozen at plan time: the oldest day this import walks back to, and the day count to it. */
  daysTotal: number;
  earliestTargetDate: string;
  finalizedThroughDate: string | null;
  newestFinalizedDate: string;
  plannedRetentionMonths: number;
};
type BackfillPlanningResult =
  | { kind: "planned"; plan: BackfillPlanState }
  | { importId: string; kind: "retry" }
  | { importId: string; kind: "waiting_for_first_data" };

type InitialPlanSettings = {
  retentionMonths: number;
  updatedAt: Date | null;
};

type BackfillPlanClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "searchAnalyticsImport" | "searchInsightsPropertyRegistry"
>;

async function readInitialPlanSettings(
  projectId: string,
  fallbackRetentionMonths?: number,
): Promise<InitialPlanSettings> {
  const defaults = await prisma.projectDefaults.findUnique({
    select: { searchSyncImportMonths: true, searchSyncPace: true, updatedAt: true },
    where: { projectId },
  });
  return {
    retentionMonths: defaults
      ? resolveSearchSyncSettings(defaults).retentionMonths
      : (fallbackRetentionMonths ?? resolveSearchSyncSettings(null).retentionMonths),
    updatedAt: defaults?.updatedAt ?? null,
  };
}

function initialPlanGuard(row: NonNullable<ImportRow>, settings: InitialPlanSettings) {
  return {
    ...userPauseGuard(row.id),
    cursorDate: row.cursorDate,
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate,
    newestFinalizedDate: row.newestFinalizedDate,
    project: {
      defaults: settings.updatedAt ? { is: { updatedAt: settings.updatedAt } } : { is: null },
    },
  };
}

async function persistInitialPlan(
  row: NonNullable<ImportRow>,
  settings: InitialPlanSettings,
  data: Prisma.SearchAnalyticsImportUpdateManyMutationInput,
) {
  const changed = await prisma.searchAnalyticsImport.updateMany({
    data,
    where: initialPlanGuard(row, settings),
  });
  return changed.count === 1;
}

export async function replanActiveGscBackfill(
  input: {
    projectId: string;
    retentionMonths: number;
  },
  client: BackfillPlanClient,
) {
  const activeProperty = await client.searchInsightsPropertyRegistry.findFirst({
    select: { propertyKey: true },
    where: { projectId: input.projectId, status: "active" },
  });
  if (!activeProperty) return false;

  // Settings persistence and re-planning share one transaction. Locking the import before
  // reading it means an in-flight batch either commits first and is observed here, or waits
  // until the new plan is stored and then fails its frozen-plan guard.
  await client.$queryRaw`
    SELECT "id"
    FROM "search_analytics_imports"
    WHERE "projectId" = ${input.projectId}
      AND "property" = ${activeProperty.propertyKey}
      AND "source" = 'gsc'
    FOR UPDATE
  `;
  const row = await client.searchAnalyticsImport.findUnique({
    where: {
      projectId_property_source: {
        projectId: input.projectId,
        property: activeProperty.propertyKey,
        source: "gsc",
      },
    },
  });
  if (
    !row?.earliestTargetDate ||
    !row.newestFinalizedDate ||
    row.pausedReason === USER_PAUSE_REASON ||
    row.state === "completed"
  ) {
    return false;
  }

  const plan = planBackfill({
    firstDataDate: row.firstDataDate ? dateKey(row.firstDataDate) : undefined,
    newestFinalizedDate: dateKey(row.newestFinalizedDate),
    retentionMonths: input.retentionMonths,
  });
  const currentEarliest = dateKey(row.earliestTargetDate);
  if (plan.earliestTargetDate === currentEarliest) return false;

  const shortened = plan.earliestTargetDate > currentEarliest;
  const completed = Boolean(
    shortened && row.cursorDate && dateKey(row.cursorDate) < plan.earliestTargetDate,
  );
  const changed = await client.searchAnalyticsImport.updateMany({
    data: {
      ...(completed
        ? { daysDone: plan.daysTotal, state: "completed", workflowId: null }
        : shortened && row.daysDone > plan.daysTotal
          ? { daysDone: plan.daysTotal }
          : {}),
      daysTotal: plan.daysTotal,
      earliestTargetDate: dateFromKey(plan.earliestTargetDate),
      plannedRetentionMonths: input.retentionMonths,
    },
    where: {
      ...userPauseGuard(row.id),
      project: {
        searchInsightsPropertyRegistry: {
          some: { propertyKey: activeProperty.propertyKey, status: "active" },
        },
      },
      state: { not: "completed" },
    },
  });
  return changed.count === 1;
}

// The first batch establishes the plan: ask the provider where finalized data stops,
// derive the retention window from that day, and pull the whole aggregate range in one
// request so the headline numbers exist before any dimensional day is fetched.
export async function ensurePlan(input: {
  now: Date;
  retentionMonths?: number;
  row: NonNullable<ImportRow>;
  session: GscSearchAnalyticsSession;
}): Promise<BackfillPlanningResult> {
  const { row } = input;
  if (row.cursorDate && row.earliestTargetDate && row.newestFinalizedDate) {
    return {
      kind: "planned",
      plan: {
        cursorDate: dateKey(row.cursorDate),
        daysTotal: row.daysTotal,
        earliestTargetDate: dateKey(row.earliestTargetDate),
        finalizedThroughDate: row.finalizedThroughDate ? dateKey(row.finalizedThroughDate) : null,
        newestFinalizedDate: dateKey(row.newestFinalizedDate),
        plannedRetentionMonths: row.plannedRetentionMonths ?? input.retentionMonths ?? 16,
      },
    };
  }

  const settings = await readInitialPlanSettings(row.projectId, input.retentionMonths);

  const probe = await probeFreshness({
    now: input.now,
    projectId: row.projectId,
    property: row.property,
    session: input.session,
  });

  const plannedRetentionMonths = settings.retentionMonths;
  const retentionPlan = planBackfill({
    newestFinalizedDate: probe.newestFinalizedDate,
    retentionMonths: plannedRetentionMonths,
  });
  const aggregate = row.firstDataDate
    ? {
        firstDataDate: dateKey(row.firstDataDate),
        kind: "data_found" as const,
        returnedDays: 0,
      }
    : await fetchAggregateRange({
        end: probe.newestFinalizedDate,
        projectId: row.projectId,
        property: row.property,
        session: input.session,
        start: retentionPlan.earliestTargetDate,
      });
  if (aggregate.kind === "data_found" && aggregate.firstDataDate > probe.newestFinalizedDate) {
    const persisted = await persistInitialPlan(row, settings, {
      availabilityBoundarySource: probe.availabilityBoundarySource,
      cursorDate: null,
      daysDone: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      firstDataDate: dateFromKey(aggregate.firstDataDate),
      historyBoundarySource: "first_data",
      lastError: null,
      lastProbeAt: probe.probedAt,
      newestFinalizedDate: dateFromKey(probe.newestFinalizedDate),
      pausedReason: null,
      plannedRetentionMonths,
      state: "waiting_for_first_data",
      workflowId: null,
    });
    if (!persisted) {
      return { importId: row.id, kind: "retry" };
    }
    return { importId: row.id, kind: "waiting_for_first_data" };
  }

  if (aggregate.kind === "no_data") {
    const persisted = await persistInitialPlan(row, settings, {
      availabilityBoundarySource: probe.availabilityBoundarySource,
      cursorDate: null,
      daysDone: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      historyBoundarySource: "no_data",
      lastError: null,
      lastProbeAt: probe.probedAt,
      newestFinalizedDate: dateFromKey(probe.newestFinalizedDate),
      pausedReason: null,
      plannedRetentionMonths,
      state: "waiting_for_first_data",
      waitingForFirstDataAt: new Date(),
      workflowId: null,
    });
    if (!persisted) {
      return { importId: row.id, kind: "retry" };
    }
    return { importId: row.id, kind: "waiting_for_first_data" };
  }
  const plan = planBackfill({
    firstDataDate: aggregate.firstDataDate,
    newestFinalizedDate: probe.newestFinalizedDate,
    retentionMonths: plannedRetentionMonths,
  });
  const persisted = await persistInitialPlan(row, settings, {
    cursorDate: dateFromKey(probe.newestFinalizedDate),
    daysTotal: plan.daysTotal,
    earliestTargetDate: dateFromKey(plan.earliestTargetDate),
    firstDataDate: dateFromKey(aggregate.firstDataDate),
    historyBoundarySource:
      plan.earliestTargetDate === aggregate.firstDataDate ? "first_data" : "retention",
    lastError: null,
    availabilityBoundarySource: probe.availabilityBoundarySource,
    lastProbeAt: probe.probedAt,
    newestFinalizedDate: dateFromKey(probe.newestFinalizedDate),
    plannedRetentionMonths,
    pausedReason: null,
    state: "running",
  });
  if (!persisted) {
    return { importId: row.id, kind: "retry" };
  }

  return {
    kind: "planned",
    plan: {
      cursorDate: probe.newestFinalizedDate,
      daysTotal: plan.daysTotal,
      earliestTargetDate: plan.earliestTargetDate,
      finalizedThroughDate: null,
      newestFinalizedDate: probe.newestFinalizedDate,
      plannedRetentionMonths,
    },
  };
}
