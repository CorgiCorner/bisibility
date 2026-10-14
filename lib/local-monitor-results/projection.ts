import { aggregateGridMeasurements } from "@/lib/local-monitoring/grid-metrics";
import {
  freezeGridSelection,
  freezeGridSubsetSelection,
} from "@/lib/local-monitoring/grid-selection";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import type { FreshnessReason, MeasurementTarget } from "@/lib/rank-measurements/types";
import type { LocalResultBinding } from "./binding";
import { LocalResultUnavailableError } from "./errors";
import type { localPointEvidence } from "./evidence";
import type { LocalResultGrid, LocalResultPoint, LocalResultReceipt } from "./model";

type PointEvidence = ReturnType<typeof localPointEvidence>;
/** Uses the existing quality resolver and grid oracle. A manual policy has no invented freshness TTL. */
export function projectLocalRun(
  binding: LocalResultBinding,
  evidence: ReadonlyMap<string, PointEvidence>,
  receipt: LocalResultReceipt,
  asOf: Date,
  options: { topN?: number; freshForMs?: number | null; freshnessReason?: FreshnessReason } = {},
) {
  const topN = options.topN ?? Math.min(3, binding.definition.axes.cutoff),
    targets: MeasurementTarget[] = [];
  const points: LocalResultPoint[] = [];
  for (const row of binding.rows) {
    const retained = evidence.get(row.item.id),
      item = receipt.items.find((value) => value.targetId === row.stored.publicId);
    if (!retained || !item) throw new LocalResultUnavailableError();
    const policy = {
      asOf,
      horizon: topN,
      minimumRequestedDepth: topN,
      freshForMs: options.freshForMs ?? null,
      expectedScope: retained.measurement.configuredScope,
      baselineEnabled: false,
    };
    const resolution = resolveMeasurements([retained.measurement], policy),
      current = resolution.current;
    targets.push({
      id: row.stored.targetKey,
      current,
      baseline: null,
      latestAttempt: resolution.latestAttempt,
      volume: null,
    });
    points.push({
      id: row.stored.publicId,
      keywordId: row.keyword.publicId,
      keyword: row.keyword.text,
      ordinal: row.gridPoint.ordinal,
      row: row.gridPoint.row,
      column: row.gridPoint.column,
      latitude: row.point.coordinate.latitude,
      longitude: row.point.coordinate.longitude,
      surface: row.target.surface,
      cutoff: row.target.cutoff,
      zoom: row.target.zoom,
      language: row.target.language,
      device: row.target.device,
      operatingSystem: row.target.operatingSystem,
      observedAt: current?.measurement.observedAt?.toISOString() ?? null,
      recordedAt: current?.measurement.recordedAt.toISOString() ?? null,
      position: current?.evidence === "positive" ? current.position : null,
      observedPosition: current?.position ?? null,
      evidence: current?.evidence ?? (resolution.latestAttempt ? "unknown" : "not_observed"),
      reason: retained.qualityReason ?? (current ? current.reason : "not_completed"),
      freshness: current?.freshness ?? "unknown",
      freshnessReason:
        current?.freshnessReason === "policy_unavailable"
          ? (options.freshnessReason ?? "policy_unavailable")
          : (current?.freshnessReason ?? "policy_unavailable"),
      identityMatch: retained.match,
      scopeClass: retained.scopeClass,
      receipt: item,
    });
  }
  const grids: LocalResultGrid[] = binding.definition.keywords
    .filter((keyword) => binding.rows.some((row) => row.keyword.id === keyword.id))
    .map((keyword) => {
      const rows = binding.rows.filter((value) => value.keyword.id === keyword.id),
        selection = (binding.retry ? freezeGridSubsetSelection : freezeGridSelection)(
          binding.definition.grid,
          rows.map((value) => value.target),
        );
      const keys = new Set(rows.map((value) => value.stored.targetKey));
      const report = aggregateGridMeasurements(
        selection,
        targets.filter((value) => keys.has(value.id)),
        {
          asOf,
          curve: Array.from({ length: topN }, () => 1),
          freshnessConfigured: options.freshForMs != null,
        },
      );
      return {
        keywordId: keyword.publicId,
        keyword: keyword.text,
        gridRevisionKey: selection.gridRevisionKey,
        identityRevisionId: binding.definition.identityRevisionId,
        topN,
        size: binding.definition.grid.size,
        pointIds: rows
          .sort((a, b) => a.gridPoint.ordinal - b.gridPoint.ordinal)
          .map((value) => value.stored.publicId),
        expected: report.expectedPoints,
        observedRate: report.observedRate,
        observedCoverage: report.observedCoverage,
        dataCoverage: report.dataCoverage,
        sampleBounds: report.sampleBounds,
        counts: report.report.counts,
        freshness: report.report.freshness,
        comparison: "unavailable",
        scope: "sampled_points",
      };
    });
  return { points, grids };
}
