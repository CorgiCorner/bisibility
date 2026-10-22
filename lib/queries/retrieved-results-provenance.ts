/** Only captured completeness establishes a stop; short snapshots and matches do not. */
export function capturedStopOnMatch(completeness: unknown): boolean | null {
  if (completeness === "truncated_by_stop_on_match") return true;
  if (completeness === "complete") return false;
  return null;
}
