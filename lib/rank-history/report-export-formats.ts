import { csvRow } from "@/lib/ui/csv";
import type { PreparedHistoryExport } from "./report-export-service";

const fields = [
  "keywordId",
  "keyword",
  "id",
  "checkedAt",
  "recordedAt",
  "checkRecordedAt",
  "observedAt",
  "requestedAt",
  "kind",
  "startedAt",
  "finishedAt",
  "status",
  "position",
  "reportedPosition",
  "rankingUrl",
  "expectedUrlAtCheck",
  "provider",
  "normalizationVersion",
  "requestedDepth",
  "evidence",
  "reason",
  "completeness",
  "completeThrough",
  "freshness",
  "freshnessReason",
  "freshnessAsOf",
  "configuredScope",
  "effectiveScope",
  "comparisonDigest",
  "errorCode",
  "deferredReason",
  "reportedProviderAttemptCount",
  "runId",
  "runStatus",
  "runOutcome",
  "outcome",
  "trigger",
  "plannedFor",
  "launchedAt",
  "blockedReason",
  "notBefore",
  "selectionKind",
  "scopeMembership",
  "rankCheckState",
  "counts",
  "normalizedItems",
  "normalizedItemCount",
] as const;
export const historyReportHeaders = fields.map((key) =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
);
export function historyReportCells(row: PreparedHistoryExport["reportRows"][number]) {
  const values = new Map(Object.entries(row));
  return fields.map((field) => {
    const value: unknown = values.get(field);
    return value === null || value === undefined
      ? ""
      : typeof value === "string" || typeof value === "number"
        ? value
        : JSON.stringify(value);
  });
}
/** V2 has one typed manifest row so empty/unknown cohorts retain their full report metadata. */
export function reportHistoryCsv(prepared: PreparedHistoryExport) {
  return [
    csvRow(["record_type", "report_metadata", ...historyReportHeaders]),
    csvRow(["report", JSON.stringify(prepared.meta), ...fields.map(() => "")]),
    ...prepared.reportRows.map((row) =>
      csvRow([
        prepared.input.stream === "attempts" ? "attempt" : "observation",
        "",
        ...historyReportCells(row),
      ]),
    ),
  ].join("\n");
}
