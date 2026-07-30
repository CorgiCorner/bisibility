export function parseRetryAfterSeconds(value: string | null, now = Date.now()) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return seconds > 0 ? seconds : null;
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return null;
  const seconds = Math.ceil((retryAt - now) / 1000);
  return seconds > 0 ? seconds : null;
}
