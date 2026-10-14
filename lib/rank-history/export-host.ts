import "server-only";
import { requirePublicId } from "@/lib/db/public-id-resources";
import { hostCalendarFreshnessPorts } from "@/lib/measurement-definitions/host-calendar";
import { verifiedDefinitionMetadataLoader } from "@/lib/measurement-definitions/query-adapter";
import { createRankTrackerHostReportOptions } from "@/lib/queries/rank-tracker-report-host";
import { authorizeRankReportScope } from "@/lib/rank-reports/access";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { assertHistoryExportCredential, type HistoryExportAuthority } from "./export-authority";

/** Read-only real metadata. No session impersonation, policy bootstrap, or paid call. */
export function historyExportReportOptions(
  context: HistoryExportAuthority,
  asOf = new Date(),
  comparisonDays = 7,
) {
  const freshness = hostCalendarFreshnessPorts({
    basis: "successor-own-slots-v1",
    configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
    legacyExecutionEngine: "dispatcher",
  });
  const load = verifiedDefinitionMetadataLoader({
    freshness,
    assertFreshScope: async (tx, project, ids) => {
      await assertHistoryExportCredential(tx, context, project);
      await authorizeRankReportScope(
        tx,
        context,
        {
          projectId: requirePublicId(project.publicId, "prj"),
          selectedIds: ids.map((id) => requirePublicId(id, "kw")),
          pageLimit: 1,
          stream: "observations",
          window: { basis: "recorded_at", from: new Date(0).toISOString(), to: asOf.toISOString() },
        },
        asOf,
      );
    },
  });
  return createRankTrackerHostReportOptions(context, load, asOf, comparisonDays);
}
