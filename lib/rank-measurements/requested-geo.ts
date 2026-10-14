import type { MeasurementPolicy } from "./types";

/** Current definition metadata carries semantic transport keys; labels are presentation only.
 * An explicit scope constraint still wins. A missing current proof never gains authority from a label. */
export function semanticRequestedGeo(
  policy: Partial<MeasurementPolicy>,
  legacyDisplayScope?: MeasurementPolicy["requestedGeo"],
): MeasurementPolicy["requestedGeo"] {
  if (policy.requestedGeo !== undefined) return policy.requestedGeo;
  const scope = policy.expectedScope;
  if (scope) return { location: scope.location, language: scope.language, device: scope.device };
  return policy.requireCurrentScope ? undefined : legacyDisplayScope;
}
