import { canonicalCoordinate } from "@/lib/local-monitoring/coordinates";
import { csvCell, csvRow } from "@/lib/ui/csv";
import type { LocalMonitorRunResult } from "./model";
export const LOCAL_POINT_REPORT_VERSION = "local-point-report-v1";
/** Trusted canonical numeric literals preserve all seven decimal places, including negative coordinates. */
function coordinateCell(value: string, axis: "latitude" | "longitude") {
  const canonical = canonicalCoordinate(
    axis === "latitude" ? value : "0",
    axis === "longitude" ? value : "0",
  );
  if (canonical[axis] !== value) throw new Error("Noncanonical export coordinate");
  return `"${value}"`;
}
export function exportLocalRunResult(report: LocalMonitorRunResult, format: "csv" | "json") {
  const manifest = {
    version: 1,
    report: LOCAL_POINT_REPORT_VERSION,
    projectId: report.projectId,
    monitorId: report.monitorId,
    runId: report.runId,
    asOf: report.asOf,
    definitionRevisionId: report.definitionRevisionId,
    identityRevisionId: report.identityRevisionId,
    subject: report.subject,
    scope: "sampled_points",
    coordinateProof: "acknowledged_query_seed_or_unknown",
    protocol: report.protocol,
    financialBasis: report.financialBasis,
    freshnessPolicy: report.freshnessPolicy ?? null,
    comparison: "unavailable",
    grids: report.grids,
  };
  if (format === "json")
    return {
      filename: `${report.runId}-local-point-report-v1.json`,
      mediaType: "application/json",
      text: JSON.stringify({ ...manifest, points: report.points }, null, 2),
    };
  const header = csvRow([
    "targetId",
    "keyword",
    "point",
    "row",
    "column",
    "latitude",
    "longitude",
    "surface",
    "language",
    "device",
    "operatingSystem",
    "cutoff",
    "zoom",
    "observedAt",
    "recordedAt",
    "qualifiedPosition",
    "observedPosition",
    "evidence",
    "reason",
    "freshness",
    "identityMatch",
    "scopeClass",
    "resolution",
    "accountingPending",
  ]);
  const rows = report.points.map((point) =>
    [
      ...(
        [point.id, point.keyword, point.ordinal + 1, point.row + 1, point.column + 1] as const
      ).map(csvCell),
      coordinateCell(point.latitude, "latitude"),
      coordinateCell(point.longitude, "longitude"),
      ...(
        [
          point.surface,
          point.language,
          point.device,
          point.operatingSystem,
          point.cutoff,
          point.zoom,
          point.observedAt,
          point.recordedAt,
          point.position,
          point.observedPosition,
          point.evidence,
          point.reason,
          point.freshness,
          point.identityMatch,
          point.scopeClass,
          point.receipt.resolution,
          point.receipt.accountingPending === null ? null : String(point.receipt.accountingPending),
        ] as const
      ).map(csvCell),
    ].join(","),
  );
  return {
    filename: `${report.runId}-local-point-report-v1.csv`,
    mediaType: "text/csv;charset=utf-8",
    text: [csvRow(["report_manifest", JSON.stringify(manifest)]), header, ...rows].join("\r\n"),
  };
}
