import type { MeasurementState, TrackingSource } from "@/lib/ai-tracking/contract";
import { csvRow } from "@/lib/ui/csv";

export interface TrackingExportRow {
  sampleId: string;
  runId: string;
  promptRevisionId: string;
  prompt: string;
  source: TrackingSource;
  engine: string;
  actualModel: string | null;
  measurement: MeasurementState;
  observedAt: string | null;
  recordedSource: string | null;
  answer: string | null;
  citations: readonly string[];
  costUsd: string | null;
  costState: string;
}
export function trackingCsv(
  rows: readonly TrackingExportRow[],
  scope?: { complete: boolean; nextCursor: string | null; resumed?: boolean },
) {
  if (rows.length > 1000) throw new Error("Export is limited to 1000 samples per page.");
  return [
    csvRow([
      "sample_id",
      "run_id",
      "prompt_revision_id",
      "prompt",
      "source",
      "engine",
      "actual_model",
      "measurement",
      "observed_at",
      "recorded_source",
      "answer",
      "cited_urls",
      "cost_usd",
      "cost_state",
      ...(scope ? ["export_complete", "next_cursor", "resumed_segment"] : []),
    ]),
    ...rows.map((row) =>
      csvRow([
        row.sampleId,
        row.runId,
        row.promptRevisionId,
        row.prompt,
        row.source,
        row.engine,
        row.actualModel,
        row.measurement,
        row.observedAt,
        row.recordedSource,
        row.answer,
        row.citations.join(" | "),
        row.costUsd,
        row.costState,
        ...(scope
          ? [String(scope.complete), scope.nextCursor, String(Boolean(scope.resumed))]
          : []),
      ]),
    ),
  ].join("\r\n");
}
