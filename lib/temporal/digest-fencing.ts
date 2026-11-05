// Kept deterministic for workflow sandbox use and independent of runtime configuration.
export const DIGEST_CLAIM_FENCING_PATCH = "alert-digest-claim-fencing-v1";
export const FENCED_DIGEST_MAX_ATTEMPTS = 5;
export function fencedDigestTaskQueue(base: string) {
  return `${base}-fenced-v1`;
}
