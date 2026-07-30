function stripTrailingSlash(path: string) {
  if (path === "/") return path;
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end -= 1;
  return path.slice(0, end) || "/";
}

function cleanPath(path: string) {
  const trimmed = path.trim();
  const withoutSuffix = trimmed.split(/[?#]/, 1)[0] ?? "";
  const withLeadingSlash = withoutSuffix.startsWith("/") ? withoutSuffix : `/${withoutSuffix}`;
  return stripTrailingSlash(withLeadingSlash);
}

function looksAbsolute(input: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(input) || input.startsWith("//");
}

export function normalizePath(input: string): string {
  const value = input.trim();
  if (!value) return "/";

  if (looksAbsolute(value)) {
    try {
      return stripTrailingSlash(new URL(value, "https://example.invalid").pathname);
    } catch {
      return "/";
    }
  }

  return cleanPath(value);
}

export function keywordPathCandidates(
  keyword: { targetUrl: string | null },
  latestRankingUrl: string | null | undefined,
): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const value of [keyword.targetUrl, latestRankingUrl]) {
    if (!value?.trim()) continue;
    const path = normalizePath(value);
    if (seen.has(path)) continue;
    seen.add(path);
    candidates.push(path);
  }

  return candidates;
}
