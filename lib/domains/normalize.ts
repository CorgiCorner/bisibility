export function normalizeDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).hostname.replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return (
      trimmed
        .replace(/^www\./, "")
        .split("/", 1)[0]
        ?.replace(/\.$/, "") || null
    );
  }
}

export function domainMatches(candidate: string | null | undefined, target: string) {
  const normalizedCandidate = candidate ? normalizeDomain(candidate) : null;
  const normalizedTarget = normalizeDomain(target);
  return Boolean(
    normalizedCandidate &&
      normalizedTarget &&
      (normalizedCandidate === normalizedTarget ||
        normalizedCandidate.endsWith(`.${normalizedTarget}`)),
  );
}
