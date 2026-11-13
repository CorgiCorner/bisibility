import { canonicalProjectHost, pagePathForProject } from "./page-path";
import type { ManualPageRejection } from "./types";

const FOREIGN_HOST = "This URL is on another site.";
const INVALID_URL = "Enter a URL or a path on this site.";
const MISSING_DOMAIN = "This project has no site domain.";
const TOO_MANY = "Only 50,000 URLs can be added in one update.";

export function manualPageLines(urls: readonly string[]) {
  const lines: { line: number; value: string }[] = [];
  let line = 0;
  for (const entry of urls) {
    for (const raw of entry.split(/\r?\n/)) {
      line += 1;
      const value = raw.trim().replace(/^"|"$/g, "").split(",")[0]?.trim();
      if (value) lines.push({ line, value });
    }
  }
  return lines;
}

function absoluteHost(value: string) {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("//")) return null;
  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function classifyManualPageLines(domain: string | null, urls: readonly string[]) {
  const rejected: ManualPageRejection[] = [];
  const accepted = new Map<string, number>();
  const projectHost = domain ? canonicalProjectHost(domain) : null;
  for (const entry of manualPageLines(urls)) {
    if (!domain || !projectHost) {
      rejected.push({ line: entry.line, reason: MISSING_DOMAIN, value: entry.value });
      continue;
    }
    const path = pagePathForProject(domain, entry.value);
    if (path) {
      if (!accepted.has(path)) accepted.set(path, entry.line);
      continue;
    }
    const host = absoluteHost(entry.value);
    rejected.push({
      line: entry.line,
      reason: host && host !== projectHost ? FOREIGN_HOST : INVALID_URL,
      value: entry.value,
    });
  }
  const paths = [...accepted.keys()];
  if (paths.length > 50_000) {
    for (const path of paths.slice(50_000)) {
      rejected.push({ line: accepted.get(path) ?? 0, reason: TOO_MANY, value: path });
    }
  }
  return { paths: paths.slice(0, 50_000), rejected };
}
