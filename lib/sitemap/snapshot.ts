import { createHash } from "node:crypto";
import type { SitemapEntry } from "./parse";

export function jsonEntries(value: unknown): SitemapEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const loc = (item as { loc?: unknown }).loc;
    const lastmod = (item as { lastmod?: unknown }).lastmod;
    if (typeof loc !== "string" || loc.length === 0) return [];
    return typeof lastmod === "string" && lastmod.length > 0 ? [{ lastmod, loc }] : [{ loc }];
  });
}

function normalizedEntries(entries: SitemapEntry[]) {
  const byLoc = new Map<string, string | null>();
  for (const entry of entries) {
    byLoc.set(entry.loc, entry.lastmod ?? null);
  }

  return Array.from(byLoc, ([loc, lastmod]) => ({ lastmod, loc })).sort((a, b) =>
    a.loc.localeCompare(b.loc),
  );
}

export function contentHash(entries: SitemapEntry[]) {
  return createHash("sha256")
    .update(JSON.stringify(normalizedEntries(entries)))
    .digest("hex");
}
