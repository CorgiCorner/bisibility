export function temporalIntegerSetting(
  name: string,
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number },
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be an integer`);

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${name} must be between ${range.min} and ${range.max}`);
  }
  return parsed;
}
