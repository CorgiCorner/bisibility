export type UrlMismatchInput = {
  position: number | null;
  rankingUrl?: string | null;
  targetUrl?: string | null;
};

function stripTrailingSlash(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

function fallbackComparableUrl(value: string) {
  const withoutProtocol = value.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  const withoutQuery = withoutProtocol.split(/[?#]/, 1)[0] ?? "";
  const [host = "", ...pathParts] = withoutQuery.split("/");
  const hostname = host.toLowerCase().replace(/^www\./, "");
  const path = stripTrailingSlash(pathParts.join("/"));

  return [hostname, path].filter(Boolean).join("/");
}

export function comparableUrl(value: string | null | undefined, baseUrl?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  if (trimmed.startsWith("/") && baseUrl) {
    try {
      candidate = new URL(baseUrl).origin + trimmed;
    } catch {
      candidate = trimmed;
    }
  }
  const absoluteCandidate = candidate.includes("://") ? candidate : `https://${candidate}`;
  try {
    const url = new URL(absoluteCandidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = stripTrailingSlash(url.pathname);

    return `${hostname}${pathname}`;
  } catch {
    return fallbackComparableUrl(trimmed) || null;
  }
}

export function hasUrlMismatch(input: UrlMismatchInput) {
  if (input.position === null) {
    return false;
  }

  const rankingUrl = comparableUrl(input.rankingUrl);
  const targetUrl = comparableUrl(input.targetUrl, input.rankingUrl);

  return Boolean(targetUrl && rankingUrl && targetUrl !== rankingUrl);
}
