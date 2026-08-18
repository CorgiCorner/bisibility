/**
 * Hosted beta resource limits - public machine contract.
 *
 * Owns the exact key/value pairs the hosted service loads in production.
 * Production deployment config consumes these keys and validates the values
 * against this contract. The docs checker imports the same values to prove the
 * canonical docs page matches what production enforces.
 *
 * Unset or `0` means unlimited for self-hosted deployments; the runtime module
 * (`lib/api/resource-limits.ts`) owns that behavior, not this contract.
 */

export const HOSTED_LIMITS = Object.freeze({
  BISIBILITY_MAX_KEYWORDS_PER_PROJECT: "1000",
  BISIBILITY_MAX_PROJECTS_PER_USER: "3",
});

export const HOSTED_LIMIT_KEYS = Object.freeze(Object.keys(HOSTED_LIMITS));

/**
 * Validate that `env` carries every hosted limit with the exact contracted
 * value. Throws on the first absent or mismatched key.
 *
 * @param {Record<string, string | undefined>} env
 */
export function assertHostedLimits(env = process.env) {
  for (const key of HOSTED_LIMIT_KEYS) {
    const actual = typeof env[key] === "string" ? env[key].trim() : "";
    const expected = HOSTED_LIMITS[key];
    if (!actual) {
      throw new Error(`Missing required hosted limit: ${key}=${expected}`);
    }
    if (actual !== expected) {
      throw new Error(
        `Hosted limit drift: ${key}=${actual}, expected ${expected}`,
      );
    }
  }
}
