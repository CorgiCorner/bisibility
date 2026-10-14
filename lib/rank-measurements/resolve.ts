import { comparablePair, determinate, qualifyMeasurement } from "./qualify";
import type {
  MeasurementEvidence,
  MeasurementPolicy,
  MovementEvent,
  QualifiedMeasurement,
  ResolvedMeasurement,
} from "./types";

function eventFor(
  current: QualifiedMeasurement | null,
  baseline: QualifiedMeasurement | null,
  hasEarlier: boolean,
): MovementEvent {
  if (!determinate(current)) return "unknown";
  if (!baseline) return hasEarlier ? "unknown" : "first";
  if (!comparablePair(current, baseline)) return "unknown";
  if (current?.evidence === "positive" && baseline.evidence === "known_absent") return "entered";
  if (current?.evidence === "known_absent" && baseline.evidence === "positive") return "exited";
  return current?.position === baseline.position ? "steady" : "moved";
}

export function resolveMeasurements(
  history: readonly MeasurementEvidence[],
  policy: MeasurementPolicy,
): ResolvedMeasurement {
  const ordered = history
    .filter((check) => check.recordedAt <= policy.asOf)
    .slice()
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id.localeCompare(a.id));
  const qualified = ordered.map((check) => qualifyMeasurement(check, policy));
  const latestAttempt = ordered[0] ?? null;
  const completed = qualified
    .filter((check) => check.measurement.execution === "completed")
    .sort((a, b) => {
      const aTime = a.measurement.observedAt ?? a.measurement.recordedAt;
      const bTime = b.measurement.observedAt ?? b.measurement.recordedAt;
      return bTime.getTime() - aTime.getTime() || b.measurement.id.localeCompare(a.measurement.id);
    });
  const current =
    completed.find(
      (check) =>
        !policy.currentNotBefore ||
        (check.measurement.observedAt ?? check.measurement.recordedAt) >= policy.currentNotBefore,
    ) ?? null;
  const lastSuccess = completed.find((check) => check.evidence === "positive") ?? null;
  let baseline: QualifiedMeasurement | null = null;
  let boundary: QualifiedMeasurement | null = null;
  const compatible: QualifiedMeasurement[] = [];
  for (const candidate of completed.filter((check) => check !== current)) {
    if (!current?.comparisonKey || candidate.comparisonKey !== current.comparisonKey) {
      boundary = candidate;
      break;
    }
    compatible.push(candidate);
    const at = candidate.measurement.observedAt ?? candidate.measurement.recordedAt;
    if (policy.baselineNotBefore && at < policy.baselineNotBefore) break;
    if (policy.baselineBefore && at > policy.baselineBefore) continue;
    if (policy.baselineEnabled !== false && !baseline)
      baseline = policy.baselineBefore
        ? qualifyMeasurement(candidate.measurement, { ...policy, asOf: policy.baselineBefore })
        : candidate;
  }
  let event = eventFor(current, baseline, completed.length > 1);
  if (latestAttempt && latestAttempt.execution !== "completed") event = "unknown";
  const baselineIndex = baseline
    ? compatible.findIndex((check) => check.measurement.id === baseline.measurement.id)
    : -1;
  const interveningAbsence =
    baselineIndex >= 0 &&
    compatible.slice(0, baselineIndex).some((check) => check.evidence === "known_absent");
  if (
    latestAttempt?.execution === "completed" &&
    current?.evidence === "positive" &&
    interveningAbsence
  )
    event = "re_entered";
  if (event === "entered" && compatible.slice(1).some((check) => check.evidence === "positive"))
    event = "re_entered";
  return {
    baseline,
    boundary,
    current,
    event,
    lastSuccess,
    latestAttempt,
    movement:
      event === "moved" || event === "steady"
        ? current?.position != null && baseline?.position != null
          ? baseline.position - current.position
          : null
        : null,
  };
}
