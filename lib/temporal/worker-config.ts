const DEFAULT_MAX_CONCURRENT_ACTIVITIES = 5;

export function maxConcurrentActivities(value = process.env.TEMPORAL_MAX_CONCURRENT_ACTIVITIES) {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_MAX_CONCURRENT_ACTIVITIES;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("TEMPORAL_MAX_CONCURRENT_ACTIVITIES must be an integer");
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("TEMPORAL_MAX_CONCURRENT_ACTIVITIES must be between 1 and 100");
  }
  return parsed;
}
