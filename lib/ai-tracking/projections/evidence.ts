import type { CostReceipt, Evidence, SamplePlan } from "@/lib/ai-tracking/contract";
import type { TrackingExportRow } from "@/lib/ai-tracking/exports/csv";
import type { AiTrackingSample } from "@/lib/generated/prisma/client";
import { trackingDenominator } from "./trends";
import type { TrackingSampleRow } from "./workspace";

type Sample = AiTrackingSample & {
  citations?: { url: string; title: string | null; position: number }[];
  observations?: { mentioned: boolean; competitorId?: string | null; entityKey?: string }[];
  promptRevision?: { publicId: string; text: string };
  run?: { publicId: string };
};
export function trackingSampleProjection(sample: Sample): TrackingSampleRow {
  const plan = sample.plan as unknown as SamplePlan;
  if (!sample.promptRevision?.publicId)
    throw new Error("Public prompt revision evidence is required.");
  const receipt = sample.receipt as unknown as CostReceipt | null;
  return {
    id: sample.publicId,
    measurement: sample.measurement,
    source: sample.source,
    engine: sample.engine,
    prompt: sample.promptRevision?.text ?? plan.promptText,
    promptRevisionId: sample.promptRevision.publicId,
    evidence: sample.evidence
      ? {
          ...(sample.evidence as unknown as Evidence),
          answerText: sample.answerText,
          raw: sample.raw as Evidence["raw"],
        }
      : null,
    citations: sample.citations ?? [],
    costUsd: receipt?.amountUsd ?? null,
    costState: receipt?.state ?? "unknown",
  };
}
export function trackingExportProjection(sample: Sample, publicRunId?: string): TrackingExportRow {
  const runId = publicRunId ?? sample.run?.publicId;
  if (!runId) throw new Error("Public run identity is required for export.");
  const row = trackingSampleProjection(sample);
  return {
    sampleId: row.id,
    runId,
    promptRevisionId: row.promptRevisionId,
    prompt: row.prompt,
    source: row.source,
    engine: row.engine,
    actualModel: row.evidence?.actualModel ?? null,
    measurement: row.measurement,
    observedAt: row.evidence?.observedAt ?? null,
    recordedSource: row.evidence?.recordedSource ?? null,
    answer: row.evidence?.answerText ?? null,
    citations: row.citations.map((citation) => citation.url),
    costUsd: row.costUsd,
    costState: row.costState,
  };
}
export function trackingTrendProjection(samples: readonly Sample[]) {
  return trackingDenominator(
    samples.map((sample) => ({
      identity: `${sample.promptRevisionId}:${sample.configurationHash}`,
      measurement: sample.measurement,
      recordedSource: (sample.evidence as unknown as Evidence | null)?.recordedSource ?? "fresh",
      mentioned:
        sample.observations?.some(
          (observation) => observation.competitorId === null && observation.mentioned,
        ) ?? null,
    })),
    samples.length,
  );
}
