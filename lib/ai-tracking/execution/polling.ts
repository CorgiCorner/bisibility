export const TRACKING_POLL_MAX_MS = 300_000;

/** Stable jitter is reproducible after a worker restart and in workflow history replay. */
export function trackingPollDelayMs(identity: string, polls: number) {
  let hash = 2166136261;
  for (const character of `${identity}:${polls}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const jitter = 0.8 + (hash % 4001) / 10_000;
  const base = Math.min(TRACKING_POLL_MAX_MS, 15_000 * 2 ** Math.min(Math.max(polls, 1), 5));
  return Math.min(TRACKING_POLL_MAX_MS, Math.round(base * jitter));
}
export function trackingSamplePollDelayMs(identity: string, claimedAt: Date | null, now: number) {
  const elapsed = Math.max(0, now - (claimedAt?.getTime() ?? now));
  const polls = 1 + Math.floor(Math.log2(1 + elapsed / 30_000));
  return trackingPollDelayMs(identity, polls);
}
