import type { Evidence, SamplePlan } from "@/lib/ai-tracking/contract";
import { payloadHash } from "@/lib/ai-tracking/identity";
import { compareTrackingPeriods, trackingDenominator } from "@/lib/ai-tracking/projections/trends";
import { trackingRun, trackingSamples } from "./ai-tracking-service";
export async function trackingTrends(projectId: string, runId: string, previousRunId?: string) {
  const [currentRun, currentPage] = await Promise.all([
    trackingRun(projectId, runId),
    trackingSamples(projectId, runId, { limit: 100 }),
  ]);
  const category = (sample: { plan: unknown }) =>
    (sample.plan as SamplePlan).promptCategory ?? "unknown";
  const observations = (run: typeof currentRun, samples: typeof currentPage.items) =>
    samples.map((sample) => {
      const evidence = sample.evidence as unknown as Evidence | null;
      return {
        identity: payloadHash([
          sample.promptRevisionId,
          sample.configurationHash,
          category(sample),
          evidence?.effectiveLocale ?? null,
          evidence?.actualModel ?? null,
          run.competitorSnapshot,
        ]),
        measurement: sample.measurement,
        recordedSource: evidence?.recordedSource ?? ("fresh" as const),
        mentioned: sample.observations.some(
          (observation) => observation.competitorId === null && observation.mentioned,
        ),
      };
    });
  const currentNeutral = currentPage.items.filter((sample) => category(sample) === "neutral");
  const expectedCurrent = currentRun.samples.filter(
    (sample) => category(sample) === "neutral",
  ).length;
  if (!previousRunId)
    return {
      currentRunId: currentRun.publicId,
      baseline: "neutral",
      current: trackingDenominator(observations(currentRun, currentNeutral), expectedCurrent),
      comparable: false,
      reason: "Select two runs with identical configuration to compare",
      delta: null,
      nextCursor: currentPage.nextCursor,
    };
  const [previousRun, previousPage] = await Promise.all([
    trackingRun(projectId, previousRunId),
    trackingSamples(projectId, previousRunId, { limit: 100 }),
  ]);
  const bounded = Boolean(previousPage.nextCursor || currentPage.nextCursor);
  const completed = currentRun.state === "completed" && previousRun.state === "completed";
  const strata = ["neutral", "comparative", "branded", "unknown"].map((stratum) => {
    const comparison = compareTrackingPeriods(
      observations(
        previousRun,
        previousPage.items.filter((sample) => category(sample) === stratum),
      ),
      observations(
        currentRun,
        currentPage.items.filter((sample) => category(sample) === stratum),
      ),
      previousRun.samples.filter((sample) => category(sample) === stratum).length,
      currentRun.samples.filter((sample) => category(sample) === stratum).length,
    );
    return {
      category: stratum,
      ...comparison,
      comparable: comparison.comparable && !bounded && completed && stratum !== "unknown",
      delta: bounded || !completed || stratum === "unknown" ? null : comparison.delta,
      reason: !completed
        ? "Only completed runs can be compared"
        : bounded
          ? "Comparison exceeds the 100-sample evidence window; narrow the corpus"
          : stratum === "unknown"
            ? "Historical prompt category is unknown"
            : comparison.reason,
    };
  });
  const neutral = strata[0];
  return {
    ...neutral,
    baseline: "neutral",
    strata,
    currentRunId: currentRun.publicId,
    previousRunId: previousRun.publicId,
    nextCursor: currentPage.nextCursor,
    previousNextCursor: previousPage.nextCursor,
  };
}
