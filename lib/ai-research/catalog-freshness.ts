import type { AiResearchCatalog } from "./catalog-types";

/**
 * Redis keeps this free catalog for 4 minutes, and an open page may use it for
 * 15 minutes. Prices are re-quoted at payment time, so the longer window is safe.
 * The old client window matched the Redis TTL, so a page could render a catalog
 * that was already near 5 minutes old and then discard it on the next edit.
 * Interaction refreshes at the Redis lifetime, sooner than two thirds of the
 * client window, because Redis has already dropped its copy by then.
 */
export const AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS = 240;
export const AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS = 15 * 60 * 1000;
export const AI_RESEARCH_CATALOG_REFRESH_AFTER_MS = AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS * 1000;

export function researchCatalogAgeMs(fetchedAt: string, now: number) {
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(fetched)) return undefined;
  return now - fetched;
}

export function isResearchCatalogFresh(catalog: Pick<AiResearchCatalog, "fetchedAt">, now: number) {
  const age = researchCatalogAgeMs(catalog.fetchedAt, now);
  return age !== undefined && age >= 0 && age <= AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS;
}

export function isResearchCatalogPastWindow(
  catalog: Pick<AiResearchCatalog, "fetchedAt"> | undefined,
  now: number,
) {
  if (!catalog) return false;
  const age = researchCatalogAgeMs(catalog.fetchedAt, now);
  return age !== undefined && age > AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS;
}

export function researchCatalogNeedsRefresh(
  catalog: Pick<AiResearchCatalog, "fetchedAt"> | undefined,
  now: number,
) {
  if (!catalog) return false;
  const age = researchCatalogAgeMs(catalog.fetchedAt, now);
  return age !== undefined && age > AI_RESEARCH_CATALOG_REFRESH_AFTER_MS;
}

export function freshResearchCatalog<T extends Pick<AiResearchCatalog, "fetchedAt">>(
  catalog: T | undefined,
  error?: string,
  now = Date.now(),
) {
  if (!catalog || error || !isResearchCatalogFresh(catalog, now)) return undefined;
  return catalog;
}
