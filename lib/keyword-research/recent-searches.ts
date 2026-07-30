const MAX_RECENT_SEARCHES = 8;

export type RecentKeywordResearch = {
  cachedUntil: string;
  connectionId?: string;
  createdAt: string;
  includeClickstream: boolean;
  locationKey?: string;
  market: string;
  mode: "auto" | "ideas" | "related" | "suggestions";
  resultLimit: 100 | 300 | 500;
  seed: string;
};

export function recentSearchesKey(projectId: string) {
  return `bisibility:keyword-research:recent:${projectId}`;
}

export function parseRecentSearches(value: string | null): RecentKeywordResearch[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentSearch).slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function isRecentSearch(value: unknown): value is RecentKeywordResearch {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RecentKeywordResearch>;
  return (
    typeof row.seed === "string" &&
    typeof row.market === "string" &&
    typeof row.createdAt === "string" &&
    typeof row.cachedUntil === "string" &&
    typeof row.includeClickstream === "boolean" &&
    (row.locationKey === undefined || typeof row.locationKey === "string") &&
    ["auto", "ideas", "related", "suggestions"].includes(row.mode ?? "") &&
    [100, 300, 500].includes(row.resultLimit ?? 0)
  );
}

export function addRecentSearch(
  current: readonly RecentKeywordResearch[],
  next: Omit<RecentKeywordResearch, "createdAt">,
  now = new Date(),
) {
  const normalizedSeed = next.seed.trim().toLowerCase();
  const withoutDuplicate = current.filter(
    (item) =>
      !(
        item.seed.trim().toLowerCase() === normalizedSeed &&
        item.market === next.market &&
        item.mode === next.mode &&
        item.resultLimit === next.resultLimit &&
        item.includeClickstream === next.includeClickstream
      ),
  );
  const createdAt = now.toISOString();
  return [
    {
      ...next,
      createdAt,
    },
    ...withoutDuplicate,
  ].slice(0, MAX_RECENT_SEARCHES);
}

export function removeRecentSearch(
  current: readonly RecentKeywordResearch[],
  target: Pick<RecentKeywordResearch, "createdAt" | "seed">,
) {
  return current.filter(
    (item) => !(item.createdAt === target.createdAt && item.seed === target.seed),
  );
}

export function cacheTimeRemaining(cachedUntil: string, now = new Date()) {
  return Math.max(0, new Date(cachedUntil).getTime() - now.getTime());
}

export function readRecentSearches(storage: Pick<Storage, "getItem">, projectId: string) {
  return parseRecentSearches(storage.getItem(recentSearchesKey(projectId)));
}

export function persistRecentSearch(
  storage: Pick<Storage, "getItem" | "setItem">,
  projectId: string,
  next: Omit<RecentKeywordResearch, "createdAt">,
  now = new Date(),
) {
  const updated = addRecentSearch(readRecentSearches(storage, projectId), next, now);
  storage.setItem(recentSearchesKey(projectId), JSON.stringify(updated));
  return updated;
}

export function persistRemoveRecentSearch(
  storage: Pick<Storage, "getItem" | "setItem">,
  projectId: string,
  target: Pick<RecentKeywordResearch, "createdAt" | "seed">,
) {
  const updated = removeRecentSearch(readRecentSearches(storage, projectId), target);
  storage.setItem(recentSearchesKey(projectId), JSON.stringify(updated));
  return updated;
}
