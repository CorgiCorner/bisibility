export function presenceUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizedCanonicalUrl(value: string | null) {
  const raw = presenceUrl(value);
  if (!raw) return null;
  const url = new URL(raw);
  url.hash = "";
  const normalized = url.toString();
  return normalized.endsWith("/") && url.pathname !== "/" ? normalized.slice(0, -1) : normalized;
}
