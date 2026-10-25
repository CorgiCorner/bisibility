/** A restore is activity from retained evidence, never a new check completion. */
export function isRestoredCheck(check: { recoveryRestoredAt?: Date | null }) {
  return check.recoveryRestoredAt != null;
}
