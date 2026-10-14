/** Unknown or unrepresentable captured tolerance disables comparison; it never selects arbitrary history. */
export function capturedBaselineWindow(before: Date | null, tolerance: number | null | undefined) {
  if (
    !before ||
    !Number.isFinite(before.getTime()) ||
    tolerance === null ||
    tolerance === undefined ||
    !Number.isSafeInteger(tolerance) ||
    tolerance < 0
  )
    return null;
  const notBefore = new Date(before.getTime() - tolerance);
  return Number.isFinite(notBefore.getTime())
    ? { before: new Date(before.getTime()), notBefore }
    : null;
}
