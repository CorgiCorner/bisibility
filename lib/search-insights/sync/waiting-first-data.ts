import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { GscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import { monthsBefore, pacificToday } from "@/lib/search-insights/dates";
import { startSearchInsightsBackfillWorkflow } from "@/lib/temporal/search-insights-client";
import { fetchAggregateRange } from "./aggregate";
import { isImportUserPaused, userPauseGuard } from "./user-pause";

type WaitingImportRow = {
  id: string;
  plannedRetentionMonths: number | null;
};

type WaitingReprobeResult = {
  daysProcessed: 0;
  projectId: string;
  status: "already_claimed" | "backfill_started" | "user_paused" | "waiting_for_first_data";
};

export async function reprobeWaitingImport(input: {
  now: Date;
  projectId: string;
  property: string;
  row: WaitingImportRow;
  session: GscSearchAnalyticsSession;
}): Promise<WaitingReprobeResult> {
  const plannedRetentionMonths = input.row.plannedRetentionMonths ?? 16;
  const discoveryEnd = pacificToday(input.now);
  const discoveryStart = monthsBefore(discoveryEnd, plannedRetentionMonths);
  // Discovery deliberately asks for finalized data only. Using `all` would detect fresh rows
  // sooner, but it would repeatedly start workflows whose finalized-data probe cannot plan yet.
  const aggregate = await fetchAggregateRange({
    end: discoveryEnd,
    projectId: input.projectId,
    property: input.property,
    session: input.session,
    start: discoveryStart,
  });

  if (aggregate.kind === "no_data") {
    await prisma.searchAnalyticsImport.update({
      data: {
        historyBoundarySource: "no_data",
        lastError: null,
        pausedReason: null,
      },
      where: { ...userPauseGuard(input.row.id), state: "waiting_for_first_data" },
    });
    return { daysProcessed: 0, projectId: input.projectId, status: "waiting_for_first_data" };
  }

  const claimed = await prisma.searchAnalyticsImport.updateMany({
    data: {
      cursorDate: null,
      daysDone: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      firstDataDate: new Date(`${aggregate.firstDataDate}T00:00:00.000Z`),
      historyBoundarySource: "first_data",
      lastError: null,
      newestFinalizedDate: null,
      pausedReason: null,
      state: "queued",
      workflowId: null,
    },
    where: { ...userPauseGuard(input.row.id), state: "waiting_for_first_data", workflowId: null },
  });
  if (claimed.count === 0) {
    return { daysProcessed: 0, projectId: input.projectId, status: "already_claimed" };
  }
  if (await isImportUserPaused(input.row.id)) {
    return { daysProcessed: 0, projectId: input.projectId, status: "user_paused" };
  }
  const started = await startSearchInsightsBackfillWorkflow({
    projectId: input.projectId,
    property: input.property,
  });
  await prisma.searchAnalyticsImport.updateMany({
    data: { workflowId: started.workflowId },
    where: { ...userPauseGuard(input.row.id), state: "queued", workflowId: null },
  });
  return { daysProcessed: 0, projectId: input.projectId, status: "backfill_started" };
}
