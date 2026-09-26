/** An estimate must fit the durable decimal column without financial rounding. */
export function exactExecutionEstimate(value: number | null, fractionDigits: 4 | 6): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new RangeError("Deployment execution estimate is unavailable.");
  }
  const fixed = value.toFixed(fractionDigits);
  const normalized = Number(fixed);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value));
  const pattern = fractionDigits === 4 ? /^\d{1,8}(?:\.\d{1,4})?$/ : /^\d{1,12}(?:\.\d{1,6})?$/;
  if (Math.abs(value - normalized) > tolerance || !pattern.test(String(normalized))) {
    throw new RangeError("Deployment execution estimate is not an exact supported decimal.");
  }
  return String(normalized);
}
