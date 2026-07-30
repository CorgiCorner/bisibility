import type { SitemapEntry } from "./parse";

export type SitemapDiff = {
  added: string[];
  lastmodChanged: string[];
  removed: string[];
};

function entryMap(entries: SitemapEntry[]) {
  const map = new Map<string, string | undefined>();
  for (const entry of entries) {
    map.set(entry.loc, entry.lastmod);
  }
  return map;
}

function orderedUniqueLocs(entries: SitemapEntry[]) {
  const seen = new Set<string>();
  const locs: string[] = [];

  for (const entry of entries) {
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);
    locs.push(entry.loc);
  }

  return locs;
}

export function diffSitemapEntries(previous: SitemapEntry[], current: SitemapEntry[]): SitemapDiff {
  const previousByLoc = entryMap(previous);
  const currentByLoc = entryMap(current);
  const currentLocs = orderedUniqueLocs(current);
  const previousLocs = orderedUniqueLocs(previous);

  return {
    added: currentLocs.filter((loc) => !previousByLoc.has(loc)),
    lastmodChanged: currentLocs.filter(
      (loc) => previousByLoc.has(loc) && previousByLoc.get(loc) !== currentByLoc.get(loc),
    ),
    removed: previousLocs.filter((loc) => !currentByLoc.has(loc)),
  };
}
