export const VISIBILITY_HORIZON = 20;

// Frozen on 2026-09-01. The original source is unrecorded and predates commit 082311834.
// Only ratios to entry zero affect the score, so rescaling the whole curve is a no-op.
// Positions beyond VISIBILITY_HORIZON score zero by definition.
// This curve predates AI Overviews and should change only in an explicit v2.
export const VISIBILITY_POSITION_WEIGHTS_V1 = [
  0.3, 0.17, 0.11, 0.08, 0.065, 0.055, 0.048, 0.042, 0.037, 0.033, 0.029, 0.026, 0.023, 0.021,
  0.019, 0.017, 0.015, 0.013, 0.011, 0.01,
] as const;

export const VISIBILITY_DESCRIPTION =
  "Visibility measures volume-weighted ranking strength in Google's Top 20. 100 means every measured keyword ranks #1. Rankings below #20 do not add Visibility. Shallow or failed checks are not treated as lost rankings.";

export const VISIBILITY_SHALLOW_CHECK_COPY =
  "Top 10 checks do not update Visibility. Affected keywords still count toward its coverage total.";

export const VISIBILITY_UNKNOWN_DEPTH_COPY =
  "Checks with unknown depth do not update Visibility. Affected keywords still count toward its coverage total.";

export const VISIBILITY_REQUIRED_DEPTH_COPY = `Visibility requires a known requested depth of at least ${VISIBILITY_HORIZON}.`;

export function visibilityUnknownDepthImportCopy(count: number) {
  const noun = count === 1 ? "row has" : "rows have";
  return `${count} received history ${noun} an unknown depth. ${VISIBILITY_UNKNOWN_DEPTH_COPY}`;
}

export function visibilityCoverageCopy(coverage: {
  limited: boolean;
  measured: number;
  total: number;
}) {
  return `${coverage.measured} of ${coverage.total}${coverage.limited ? " newest" : ""} keywords measured`;
}
