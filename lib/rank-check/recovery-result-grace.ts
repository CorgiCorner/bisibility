/** Longer than supported product persistence transactions; capture is not a failed save. */
export const RESULT_PERSISTENCE_GRACE_MS = 2 * 60_000;
export const resultRecoveryCutoff = (now: Date) =>
  new Date(now.getTime() - RESULT_PERSISTENCE_GRACE_MS);
