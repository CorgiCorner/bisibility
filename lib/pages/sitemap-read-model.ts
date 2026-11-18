import { jsonEntries } from "@/lib/sitemap/snapshot";
import { pagePathForProject } from "./page-path";

export const SITEMAP_READ_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export type StoredSitemapRead = {
  fetchedAt: Date;
  latestFetchedAt?: Date;
  paths: string[];
  checked?: boolean;
  complete?: boolean;
  freshSince?: Date;
};
export type SitemapReadRow = {
  entries: unknown;
  fetchedAt: Date;
  sitemapUrl: string;
  urlCount?: number;
  complete: boolean;
};

/** The oldest root read is the watermark at which absence can be proved. */
export function normalizeStoredSitemapReads(
  rows: readonly SitemapReadRow[],
  domain: string,
  enabled: boolean,
  now: Date,
  requiredUrls: readonly string[] = [],
): StoredSitemapRead | null {
  if (!rows.length) return null;
  const latest = new Map<string, SitemapReadRow>();
  for (const row of rows) {
    const current = latest.get(row.sitemapUrl);
    if (!current || row.fetchedAt > current.fetchedAt) latest.set(row.sitemapUrl, row);
  }
  const roots = [...latest.values()];
  const fresh = enabled
    ? roots.filter(
        (row) =>
          row.fetchedAt <= now &&
          now.getTime() - row.fetchedAt.getTime() <= SITEMAP_READ_MAX_AGE_MS,
      )
    : [];
  const paths = fresh.flatMap((row) =>
    jsonEntries(row.entries).flatMap((entry) => {
      const path = pagePathForProject(domain, entry.loc);
      return path ? [path] : [];
    }),
  );
  return {
    fetchedAt: new Date(Math.min(...roots.map((row) => row.fetchedAt.getTime()))),
    latestFetchedAt: new Date(Math.max(...roots.map((row) => row.fetchedAt.getTime()))),
    paths: [...new Set(paths)],
    checked: fresh.length > 0,
    freshSince: new Date(now.getTime() - SITEMAP_READ_MAX_AGE_MS),
    complete:
      requiredUrls.every((url) => latest.has(url)) &&
      fresh.length === roots.length &&
      roots.every(
        (row) =>
          row.complete !== false &&
          Array.isArray(row.entries) &&
          (row.urlCount === undefined || row.urlCount === jsonEntries(row.entries).length),
      ),
  };
}

export function sitemapMembershipForPage(
  read: StoredSitemapRead | null,
  domain: string,
  url: string,
  firstSeenAt: Date,
): boolean | null {
  if (!read || read.checked === false) return null;
  const path = pagePathForProject(domain, url);
  if (!path) return null;
  if (read.paths.includes(path)) return true;
  if (read.complete === false || firstSeenAt > read.fetchedAt) return null;
  return false;
}
