import "server-only";
import { decodeOffsetCursor, encodeOffsetCursor } from "@/lib/api/pagination";
import { requirePublicId } from "@/lib/db/public-id-resources";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import type { RankReportDatabase } from "@/lib/rank-reports/access";
import type { ReportCursorCodec } from "@/lib/rank-reports/cursor";
import { RankReportCursorError } from "@/lib/rank-reports/errors";
import { pageRankReportRecords } from "@/lib/rank-reports/page";
import type {
  RankReportItem,
  RankReportObservation,
  RankReportRecord,
} from "@/lib/rank-reports/records";
import { historyRangeStart, legacyHistoryFromSnapshot } from "./bounded-history";
import { type HistoryExportAuthority, snapshotHistoryExportAuthority } from "./export-authority";
import { decodeExportCursor, exportCursorBinding, verifyExportCursor } from "./export-cursor";
import type { HistoryRunRecord } from "./export-run-records";
import { rankHistoryRows } from "./export-service";
import { loadHistoryExportSnapshot } from "./export-snapshot";
import { historyExportRequestSchema } from "./report-export-model";

type ExportObservation = RankReportObservation & {
  normalizedItems: RankReportItem[];
  normalizedItemCount: number;
};

export type HistoryExportServiceOptions = {
  codec: ReportCursorCodec;
  firstAsOf: Date;
  reportAt: (asOf: Date) => RankTrackerReportOptions;
  db?: RankReportDatabase;
};
/** Fully validate before returning any CSV bytes. No network/provider/cost side effects. */
export async function prepareRankHistoryExport(
  sourceContext: HistoryExportAuthority,
  value: unknown,
  projectId: string,
  options: HistoryExportServiceOptions,
  selectionQuery?: RankTrackerQueryState,
) {
  const context = snapshotHistoryExportAuthority(sourceContext);
  const input = historyExportRequestSchema.parse(value);
  // Decode before any read. Default V1 pages a fresh bounded authorized selection, as before.
  let offset = 0;
  if (input.version === "1") {
    try {
      offset = decodeOffsetCursor(input.cursor ?? null);
    } catch {
      throw new RankReportCursorError();
    }
  }
  const cursor = decodeExportCursor(input, options.codec);
  const asOf = cursor ? new Date(cursor.asOf) : new Date(options.firstAsOf.getTime());
  if (!Number.isFinite(asOf.getTime()) || asOf > options.firstAsOf)
    throw new RankReportCursorError();
  const snapshot = await loadHistoryExportSnapshot(
    context,
    {
      projectId,
      keywordIds: input.keywordIds,
      query: selectionQuery,
      includeUnobservedRuns: input.version === "2" && input.stream === "attempts",
      includeNormalizedItems: input.version === "2" && input.stream === "observations",
    },
    options.reportAt(asOf),
    options.db,
  );
  const binding = exportCursorBinding(context, input, snapshot);
  verifyExportCursor(cursor, binding, snapshot);
  const legacy = legacyHistoryFromSnapshot(snapshot, {
    range: input.range,
    keywordIds: input.keywordIds,
  });
  const legacyRows = rankHistoryRows(legacy, input.granularity);
  const window = {
    basis: input.basis,
    from: input.from ?? historyRangeStart(input.range, asOf).toISOString(),
    to: input.to ?? asOf.toISOString(),
  };
  const names = new Map(snapshot.keywords.map((keyword) => [keyword.publicId, keyword.text]));
  const rows: Array<
    | ((RankReportRecord | ExportObservation) & { keyword: string })
    | (HistoryRunRecord & { keyword?: string })
  > = [];
  for (const record of snapshot.records) {
    const selected = input.stream === "attempts" ? record.attempt : record.observation;
    if (selected)
      rows.push({
        ...selected,
        keyword: names.get(selected.keywordId) ?? "",
        ...(input.stream === "observations"
          ? { normalizedItems: record.items, normalizedItemCount: record.items.length }
          : {}),
      });
  }
  if (input.version === "2" && input.stream === "attempts")
    for (const record of snapshot.unobservedRecords)
      rows.push({
        ...record,
        ...("keywordId" in record ? { keyword: names.get(record.keywordId) ?? "" } : {}),
      });
  const projectRef = requirePublicId(snapshot.project.publicId, "prj");
  const selectedIds = snapshot.targets.map(({ id }) => requirePublicId(id, "kw"));
  const reportPage = pageRankReportRecords(
    rows,
    { projectId: projectRef, selectedIds, pageLimit: input.limit, stream: input.stream, window },
    cursor?.last ?? null,
  );
  const legacyPage = legacyRows.slice(offset, offset + input.limit);
  const nextOffset = offset + legacyPage.length;
  const nextCursor =
    input.version === "1"
      ? nextOffset < legacyRows.length
        ? encodeOffsetCursor(nextOffset)
        : null
      : reportPage.last
        ? options.codec.encode({
            asOf: snapshot.asOf,
            binding,
            last: reportPage.last,
            source: snapshot.sourceDigest,
            version: 1,
          })
        : null;
  const fullReport = pageRankReportRecords(
    rows,
    {
      projectId: projectRef,
      selectedIds,
      pageLimit: Number.MAX_SAFE_INTEGER,
      stream: input.stream,
      window,
    },
    null,
  );
  return {
    input,
    project: snapshot.project,
    legacyRows,
    legacyPage,
    reportRows: fullReport.records,
    reportPage: reportPage.records,
    nextCursor,
    meta: {
      version: 2 as const,
      aggregation: "none" as const,
      asOf: snapshot.asOf,
      window,
      summaryBasis: "current_definition_as_of_registered_baseline" as const,
      definitionVersion: snapshot.policy.metric.definitionVersion,
      metricId: snapshot.policy.metric.id,
      selectionDigest: snapshot.summary.selectionDigest,
      totalCount: fullReport.totalCount,
      excludedUnknownTime: fullReport.excludedUnknownTime,
      unresolvedMembershipCount:
        input.stream === "attempts" ? snapshot.unresolvedMembershipCount : 0,
      normalizedItems: {
        totalCount: fullReport.records.reduce(
          (count, row) => count + ("normalizedItems" in row ? row.normalizedItems.length : 0),
          0,
        ),
        completeness: "retained_only" as const,
        isTruncated: false as const,
        capacity: snapshot.normalizedItemLimit,
        paging: "observation_pages_only" as const,
      },
      summary: snapshot.summary,
      resolutions: snapshot.resolutions,
      membership: snapshot.membership,
    },
  };
}
export type PreparedHistoryExport = Awaited<ReturnType<typeof prepareRankHistoryExport>>;
