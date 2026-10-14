import { type AggregatePolicy, aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import type { MeasurementReport, MeasurementTarget } from "@/lib/rank-measurements/types";
import type { freezeGridSelection } from "./grid-selection";

export const GRID_TOP_N_DEFINITION = "sampled-grid-top-n-v1";
export type GridSelection = ReturnType<typeof freezeGridSelection>;

export function aggregateGridMeasurements(
  selection: GridSelection,
  input: readonly MeasurementTarget[],
  policy: Omit<
    AggregatePolicy,
    "metricId" | "definitionVersion" | "eligibleTotal" | "weightProvenance"
  >,
) {
  const expectedKeys = selection.targets.map(({ key }) => key);
  const actualKeys = input.map(({ id }) => id);
  if (
    actualKeys.length !== expectedKeys.length ||
    new Set(actualKeys).size !== actualKeys.length ||
    actualKeys.some((id) => !expectedKeys.includes(id))
  )
    throw new Error("Grid report requires the full frozen expected target set");
  if (!policy.curve.length || policy.curve.some((value) => value !== 1))
    throw new Error("Grid TopN requires an explicit binary unit curve");
  if (selection.targets.some(({ target }) => target.cutoff < policy.curve.length))
    throw new Error("Grid TopN exceeds the selected capture cutoff");
  const report = aggregateMeasurements(
    input.map((target) => ({ ...target, volume: 1 })),
    {
      ...policy,
      metricId: "grid_top_n",
      definitionVersion: GRID_TOP_N_DEFINITION,
      eligibleTotal: expectedKeys.length,
      weightProvenance: { source: "sampled_points_unit_weight", period: null, market: null },
    },
  );
  return {
    gridRevisionKey: selection.gridRevisionKey,
    selectionKey: selection.selectionKey,
    topN: policy.curve.length,
    ...projectGridReport(report),
  };
}

/** Sample bounds use the shared oracle's fresh determinate count, never raw known positions. */
export function projectGridReport(report: MeasurementReport) {
  if (
    report.metricId !== "grid_top_n" ||
    report.definitionVersion !== GRID_TOP_N_DEFINITION ||
    report.isTruncated ||
    report.includedCount !== report.counts.expected ||
    report.eligibleTotal !== report.counts.expected ||
    report.weightProvenance.source !== "sampled_points_unit_weight"
  )
    throw new Error("Incompatible or truncated grid metric report");
  const { expected, measured, metricEligible, freshDeterminate } = report.counts;
  for (const count of [expected, measured, metricEligible, freshDeterminate]) {
    if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > expected))
      throw new Error("Incoherent grid counts");
  }
  if (
    metricEligible > measured ||
    report.contributions.length !== metricEligible ||
    new Set(report.contributions.map(({ targetId }) => targetId)).size !== metricEligible
  )
    throw new Error("Incoherent grid metric population");
  if (report.observedCoverage !== (expected > 0 ? measured / expected : null))
    throw new Error("Grid observed coverage disagrees with determinate population");
  const unitContribution = metricEligible > 0 ? 100 / metricEligible : 0;
  if (
    report.contributions.some(
      ({ weight, value }) =>
        weight !== 1 ||
        value === null ||
        (value !== 0 && Math.abs(value - unitContribution) > 1e-8),
    )
  )
    throw new Error("Grid bounds require unweighted binary TopN contributions");
  const eligibleTopNCount = report.contributions.filter(
    ({ value }) => value !== null && value > 0,
  ).length;
  const eligibleRate = metricEligible > 0 ? eligibleTopNCount / metricEligible : null;
  if (
    (report.value === null) !== (eligibleRate === null) ||
    (report.value !== null &&
      eligibleRate !== null &&
      Math.abs(report.value / 100 - eligibleRate) > 1e-8)
  )
    throw new Error("Grid value disagrees with shared contributions");
  const knownFreshness =
    freshDeterminate !== null &&
    freshDeterminate === metricEligible &&
    report.freshnessReason === null &&
    report.counts.unknownFreshness === 0;
  if (
    freshDeterminate !== null &&
    report.freshnessReason === null &&
    report.counts.unknownFreshness === 0 &&
    !knownFreshness
  )
    throw new Error("Grid fresh and eligible populations disagree");
  const dataCoverage = expected > 0 && knownFreshness ? freshDeterminate / expected : null;
  if (report.dataCoverage !== dataCoverage)
    throw new Error("Grid coverage disagrees with fresh determinate population");
  const unresolvedExpected = knownFreshness ? expected - freshDeterminate : null;
  return {
    report,
    expectedPoints: expected,
    observedDeterminateCount: measured,
    eligibleDeterminateCount: metricEligible,
    provenFreshDeterminateCount: knownFreshness ? freshDeterminate : null,
    eligibleTopNCount,
    freshTopNCount: knownFreshness ? eligibleTopNCount : null,
    observedRate: eligibleRate,
    observedCoverage: report.observedCoverage,
    dataCoverage,
    unresolvedExpected,
    sampleBounds:
      expected > 0 && unresolvedExpected !== null
        ? ([
            eligibleTopNCount / expected,
            (eligibleTopNCount + unresolvedExpected) / expected,
          ] as const)
        : null,
    scope: "sampled_points" as const,
  };
}
