import { effectiveRequestedDepth } from "@/lib/checks/status";
import { VISIBILITY_HORIZON, VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";

export { VISIBILITY_HORIZON, VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";

type VisibilityCheck = {
  normalizationVersion: string | null;
  position: number | null;
  requestedDepth: number | null;
  status: string;
};

type VisibilityObservation = Pick<VisibilityCheck, "normalizationVersion" | "position">;

export type VisibilitySnapshot = {
  current: VisibilityObservation | null;
  previous: VisibilityObservation | null;
  volume: number | null;
};

export type VisibilitySummary = {
  comparableKeywordCount: number;
  delta: number | null;
  measuredKeywordCount: number;
  value: number | null;
};

function eligibleCheck(check: VisibilityCheck) {
  const depth = effectiveRequestedDepth(check);
  return check.status === "completed" && depth !== null && depth >= VISIBILITY_HORIZON;
}

export function visibilitySnapshotFor(
  keyword: { rankChecks: readonly VisibilityCheck[] },
  volume: number | null = null,
): VisibilitySnapshot {
  const eligible = keyword.rankChecks.filter(eligibleCheck);
  const current = eligible[0] ?? null;
  const candidate = eligible[1] ?? null;
  const previous =
    current?.normalizationVersion &&
    candidate?.normalizationVersion === current.normalizationVersion
      ? candidate
      : null;
  return { current, previous, volume };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function visibilityScore(snapshots: readonly VisibilitySnapshot[], key: "current" | "previous") {
  const known = snapshots.flatMap((item) =>
    item.volume !== null && Number.isFinite(item.volume) ? [Math.max(0, item.volume)] : [],
  );
  const fallbackWeight = known.length ? median(known) : 1;
  let weightedPosition = 0;
  let totalWeight = 0;
  for (const snapshot of snapshots) {
    const weight = snapshot.volume === null ? fallbackWeight : Math.max(0, snapshot.volume);
    const position = snapshot[key]?.position;
    const positionWeight =
      typeof position === "number" &&
      Number.isInteger(position) &&
      position > 0 &&
      position <= VISIBILITY_HORIZON
        ? VISIBILITY_POSITION_WEIGHTS_V1[position - 1]
        : 0;
    weightedPosition += positionWeight * weight;
    totalWeight += weight;
  }
  return totalWeight
    ? (weightedPosition / (VISIBILITY_POSITION_WEIGHTS_V1[0] * totalWeight)) * 100
    : 0;
}

export function summarizeVisibility(snapshots: readonly VisibilitySnapshot[]): VisibilitySummary {
  // Headline uses every measured keyword; delta uses only keywords with two comparable
  // observations. Aligning them would hide fresh measurements from the current score.
  const measured = snapshots.filter((snapshot) => snapshot.current !== null);
  const comparable = measured.filter((snapshot) => snapshot.previous !== null);
  return {
    comparableKeywordCount: comparable.length,
    delta: comparable.length
      ? visibilityScore(comparable, "current") - visibilityScore(comparable, "previous")
      : null,
    measuredKeywordCount: measured.length,
    value: measured.length ? visibilityScore(measured, "current") : null,
  };
}
