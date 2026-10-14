import "server-only";
import { hostCalendarFreshnessPorts } from "@/lib/measurement-definitions/host-calendar";
import type { DefinitionTransaction } from "@/lib/measurement-definitions/model";
import { verifiedDefinitionMetadataLoader } from "@/lib/measurement-definitions/query-adapter";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { createRankTrackerHostReportOptions } from "./rank-tracker-report-host";

export type ConsumerScopeCheck = (
  tx: DefinitionTransaction,
  project: { id: string; publicId: string },
  ids: readonly string[],
) => Promise<void>;
/** Trusted internal composition; every read renews its caller/service and never invents a User. */
export function consumerReportOptions(asOf: Date, assertFreshScope: ConsumerScopeCheck) {
  const freshness = hostCalendarFreshnessPorts({
    basis: "successor-own-slots-v1",
    configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
    legacyExecutionEngine: "dispatcher",
  });
  const load = verifiedDefinitionMetadataLoader({ assertFreshScope, freshness });
  return {
    ...createRankTrackerHostReportOptions(undefined, load, asOf, 7),
    pausedSchedules: "include_retained" as const,
  };
}
