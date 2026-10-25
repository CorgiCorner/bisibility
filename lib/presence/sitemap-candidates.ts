import { fetchPublicDocument } from "@/lib/expected-url/public-document-fetch";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";
import { parseSitemapXml } from "@/lib/sitemap/parse";
import { presenceUrl } from "./url";

export const MAX_INDEXING_SITEMAP_FILES = 20;
export const MAX_INDEXING_SITEMAP_URLS = 5000;

// Reuse the monitor's safe transport and parser, without reading or writing its snapshots.
export async function discoverSitemapCandidates(
  property: string,
  roots: string[],
  fetchDocument = fetchPublicDocument,
  options: { runDeadline?: number; clock?: () => number } = {},
) {
  const queue = roots.map((url) => ({ url, depth: 0 }));
  const seen = new Set<string>();
  const urls = new Map<string, string>();
  const parents = new Map<string, string>();
  const childCounts = new Map<string, number>();
  let complete = true;
  const clock = options.clock ?? Date.now;
  const deadline = Math.min(clock() + 180_000, options.runDeadline ?? Infinity);
  while (queue.length && seen.size < MAX_INDEXING_SITEMAP_FILES && clock() < deadline) {
    const item = queue.shift();
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    if (!gscPropertyContainsUrl(property, item.url)) {
      complete = false;
      continue;
    }
    try {
      const document = await fetchDocument({
        url: item.url,
        protocols: ["http:", "https:"],
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: Math.max(1, Math.min(10_000, deadline - clock())),
        headers: { "user-agent": "bisibility Page indexing/1.0" },
      });
      if (!gscPropertyContainsUrl(property, document.url)) {
        complete = false;
        continue;
      }
      const parsed = parseSitemapXml(document.body, {
        maxEntries: MAX_INDEXING_SITEMAP_URLS,
        maxChildSitemaps: MAX_INDEXING_SITEMAP_FILES,
      });
      complete &&= !parsed.truncated && parsed.kind !== "unknown";
      if (parsed.kind === "sitemapindex") {
        childCounts.set(item.url, parsed.childSitemapUrls.length);
        if (item.depth >= 2) {
          complete = false;
          continue;
        }
        for (const loc of parsed.childSitemapUrls) {
          const child = new URL(loc, document.url).href;
          if (child !== item.url && !parents.has(child)) parents.set(child, item.url);
          if (!seen.has(child)) queue.push({ url: child, depth: item.depth + 1 });
        }
      }
      for (const entry of parsed.entries) {
        const url = presenceUrl(entry.loc);
        if (!url || !gscPropertyContainsUrl(property, url)) continue;
        if (urls.has(url)) continue;
        if (urls.size >= MAX_INDEXING_SITEMAP_URLS) {
          complete = false;
          break;
        }
        urls.set(url, item.url);
      }
    } catch {
      complete = false;
    }
  }
  if (clock() >= deadline) complete = false;
  if (queue.some((entry) => !seen.has(entry.url))) complete = false;
  return { complete, urls, parents, childCounts };
}
