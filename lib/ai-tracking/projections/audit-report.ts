import type { AgentReportInput } from "@/lib/agent-reports/model";
import { trackingAuditExperiment, trackingAuditNextSteps } from "./audit-next-steps";
import { trackingCitationGroups } from "./citations";
import type { TrackingSampleRow } from "./workspace";

export function trackingEvidenceAudit({
  runId,
  samples,
  expected,
  hasMore,
}: Readonly<{
  runId: string;
  samples: readonly TrackingSampleRow[];
  expected: number;
  hasMore: boolean;
}>): AgentReportInput {
  const evidence = samples.map((sample) => ({
    sampleId: sample.id,
    promptRevisionId: sample.promptRevisionId,
    prompt: sample.prompt,
    source: sample.source,
    engine: sample.engine,
    measurement: sample.measurement,
    actualModel: sample.evidence?.actualModel ?? null,
    requestedLocale: sample.evidence?.requestedLocale ?? null,
    effectiveLocale: sample.evidence?.effectiveLocale ?? null,
    observedAt: sample.evidence?.observedAt ?? null,
    freshness: sample.evidence?.recordedSource ?? "unknown",
    citedUrls: sample.citations.map((citation) => citation.url),
    costUsd: sample.costUsd,
    costState: sample.costState,
  }));
  const measurementCounts = Object.fromEntries(
    ["answer_present", "aio_not_present", "partial", "failed", "unknown", "unavailable"].map(
      (state) => [state, samples.filter((sample) => sample.measurement === state).length],
    ),
  );
  const complete = !hasMore && samples.length >= expected;
  const limits = {
    expectedSamples: expected,
    loadedSamples: samples.length,
    complete,
    citedPagesFetched: 0,
    citedPageContentVerified: false,
    brandMentionRateCalculated: false,
  };
  return {
    kind: "ai_visibility_audit",
    title: "Retained AI visibility evidence audit",
    body: {
      method: "retained_evidence",
      runId,
      measurementCounts,
      missingSamples: Math.max(0, expected - samples.length),
      citedDomains: trackingCitationGroups(samples).map((group) => ({
        domain: group.domain,
        citingSamples: group.sampleCount,
        urls: group.urls.map((entry) => ({
          url: entry.url,
          sampleIds: entry.samples.map((sample) => sample.id),
        })),
      })),
      evidence,
      proposedNextSteps: trackingAuditNextSteps(samples, complete),
      proposedExperiment: trackingAuditExperiment(samples),
      limits,
      limitations: [
        "Cited page contents were not fetched or verified.",
        "Citation counts describe retained evidence; they do not measure popularity or market share.",
        "No sentiment, rank, mention improvement, or causal attribution is inferred.",
        ...(complete ? [] : ["This audit contains only a bounded part of the selected run."]),
      ],
    },
    provenance: {
      method: "retained_evidence",
      runId,
      evidenceIds: samples.map((sample) => sample.id),
      promptRevisionIds: samples.map((sample) => sample.promptRevisionId),
      limits,
    },
  };
}
