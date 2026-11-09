/** Optional self-host resource knobs. Unset or zero means unlimited. */
export const RESOURCE_LIMIT_KEYS = Object.freeze([
  "BISIBILITY_MAX_KEYWORDS_PER_PROJECT",
  "BISIBILITY_MAX_PROJECTS_PER_USER",
]);

/** Validate configured overrides without prescribing hosted commercial limits. */
export function assertResourceLimits(env = process.env) {
  for (const key of RESOURCE_LIMIT_KEYS) {
    const value = env[key]?.trim();
    if (!value) continue;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error(`${key} must be a non-negative safe integer.`);
    }
  }
}
