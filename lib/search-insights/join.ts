/**
 * Empty and query-only values are rooted at `/`, so each has a stable, explicit landing key.
 */
export function normalizeLandingPath(input: string): string {
  const value = input.trim();
  if (!value) return "/";

  let parsed: URL;
  try {
    const absolute = new URL(value);
    if (absolute.protocol === "http:" || absolute.protocol === "https:") parsed = absolute;
    else throw new TypeError("Unsupported landing path scheme");
  } catch {
    const rooted = value.startsWith("/") ? value : `/${value}`;
    parsed = new URL(rooted, "http://placeholder.invalid");
  }
  return `${trimTrailing(parsed.pathname)}${parsed.search}`;
}

function trimTrailing(value: string) {
  if (value === "/") return value;
  const normalized = value.replace(/\/$/u, "");
  return normalized || "/";
}
