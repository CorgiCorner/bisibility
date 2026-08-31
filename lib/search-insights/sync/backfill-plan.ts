import { prisma } from "@/lib/db/prisma";
import type { GscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import { dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { fetchAggregateRange, probeFreshness } from "./aggregate";
import type { ImportRow } from "./import-state";
import { planBackfill } from "./plan";
import { userPauseGuard } from "./user-pause";

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
  | { importId: string; kind: "waiting_for_first_data" };
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

  const probe = await probeFreshness({
    now: input.now,
    projectId: row.projectId,
    property: row.property,
    session: input.session,
  });

  const plannedRetentionMonths = input.retentionMonths ?? 16;
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
    await prisma.searchAnalyticsImport.update({
      data: {
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
      },
      where: userPauseGuard(row.id),
    });
    return { importId: row.id, kind: "waiting_for_first_data" };
  }

  if (aggregate.kind === "no_data") {
    await prisma.searchAnalyticsImport.update({
      data: {
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
      },
      where: userPauseGuard(row.id),
    });
    return { importId: row.id, kind: "waiting_for_first_data" };
  }
  const plan = planBackfill({
    firstDataDate: aggregate.firstDataDate,
    newestFinalizedDate: probe.newestFinalizedDate,
    retentionMonths: plannedRetentionMonths,
  });
  await prisma.searchAnalyticsImport.update({
    data: {
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
    },
    where: userPauseGuard(row.id),
  });

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
