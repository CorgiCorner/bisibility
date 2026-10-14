import { type RecordedMeasurementCheck, recordedMeasurement } from "./recorded-check";
import { resolveMeasurements } from "./resolve";
import type { MeasurementPolicy } from "./types";

export function resolveRecordedChecks(
  checks: readonly RecordedMeasurementCheck[],
  targetId: string,
  policy: Partial<MeasurementPolicy> = {},
  projectId?: string,
) {
  return resolveMeasurements(
    checks.map((check) => recordedMeasurement(check, targetId, projectId)),
    {
      ...policy,
      asOf: policy.asOf ?? new Date(),
      horizon: policy.horizon ?? 100,
    },
  );
}
