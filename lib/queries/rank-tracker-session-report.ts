import "server-only";
import { hostCalendarFreshnessPorts } from "@/lib/measurement-definitions/host-calendar";
import { currentDefinitionMetadataLoader } from "@/lib/measurement-definitions/query-adapter";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { getQueryActor } from "./_auth";
import { createRankTrackerHostReportOptions } from "./rank-tracker-report-host";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

/** Page construction never initializes semantic policy, adjusts schedules, or performs provider I/O. */
export async function createSessionRankTrackerReportOptions(
  asOf = new Date(),
  comparisonDays = 7,
): Promise<RankTrackerReportOptions> {
  const actor = await getQueryActor();
  const context = { actor: { id: actor.id }, transport: "session" as const };
  const freshness = hostCalendarFreshnessPorts({
    basis: "successor-own-slots-v1",
    configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
    legacyExecutionEngine: "dispatcher",
  });
  return createRankTrackerHostReportOptions(
    context,
    currentDefinitionMetadataLoader(context, freshness),
    asOf,
    comparisonDays,
  );
}
