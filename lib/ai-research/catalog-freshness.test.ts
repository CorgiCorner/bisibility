import { describe, expect, it } from "vitest";
import {
  AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS,
  AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS,
  AI_RESEARCH_CATALOG_REFRESH_AFTER_MS,
  freshResearchCatalog,
  isResearchCatalogFresh,
  isResearchCatalogPastWindow,
  researchCatalogNeedsRefresh,
} from "./catalog-freshness";

const fetchedAtMs = Date.parse("2026-10-22T16:31:53.000Z");
const catalog = { fetchedAt: new Date(fetchedAtMs).toISOString() };
const clientWindow = AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS;
const refreshAfter = AI_RESEARCH_CATALOG_REFRESH_AFTER_MS;

describe("AI research catalog freshness", () => {
  it("keeps the server cache shorter than the client window", () => {
    expect(AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS).toBe(240);
    expect(clientWindow).toBe(15 * 60 * 1000);
    expect(refreshAfter).toBe(240_000);
    expect(AI_RESEARCH_CATALOG_CACHE_TTL_SECONDS * 1000).toBeLessThan(clientWindow);
    expect(refreshAfter).toBeLessThan(clientWindow);
  });

  it("stays usable at the old five-minute boundary and asks for a refresh then", () => {
    expect(isResearchCatalogFresh(catalog, fetchedAtMs + 190_000)).toBe(true);
    expect(researchCatalogNeedsRefresh(catalog, fetchedAtMs + 190_000)).toBe(false);
    expect(isResearchCatalogPastWindow(catalog, fetchedAtMs + 190_000)).toBe(false);
    expect(isResearchCatalogFresh(catalog, fetchedAtMs + 310_000)).toBe(true);
    expect(researchCatalogNeedsRefresh(catalog, fetchedAtMs + 310_000)).toBe(true);
    expect(isResearchCatalogPastWindow(catalog, fetchedAtMs + 310_000)).toBe(false);
    expect(freshResearchCatalog(catalog, undefined, fetchedAtMs + 310_000)).toBe(catalog);
  });

  it("refreshes only after the server cache lifetime and expires after the client window", () => {
    expect(researchCatalogNeedsRefresh(catalog, fetchedAtMs + refreshAfter)).toBe(false);
    expect(researchCatalogNeedsRefresh(catalog, fetchedAtMs + refreshAfter + 1)).toBe(true);
    expect(isResearchCatalogFresh(catalog, fetchedAtMs + clientWindow)).toBe(true);
    expect(isResearchCatalogPastWindow(catalog, fetchedAtMs + clientWindow)).toBe(false);
    expect(isResearchCatalogFresh(catalog, fetchedAtMs + clientWindow + 1)).toBe(false);
    expect(isResearchCatalogPastWindow(catalog, fetchedAtMs + clientWindow + 1)).toBe(true);
    expect(freshResearchCatalog(catalog, undefined, fetchedAtMs + clientWindow + 1)).toBe(
      undefined,
    );
  });

  it("ignores a missing catalog, a load error, a future timestamp and an unreadable one", () => {
    expect(researchCatalogNeedsRefresh(undefined, fetchedAtMs)).toBe(false);
    expect(isResearchCatalogPastWindow(undefined, fetchedAtMs)).toBe(false);
    expect(freshResearchCatalog(undefined, undefined, fetchedAtMs)).toBeUndefined();
    expect(freshResearchCatalog(catalog, "provider unavailable", fetchedAtMs)).toBe(undefined);
    const future = { fetchedAt: new Date(fetchedAtMs + 1_000).toISOString() };
    expect(isResearchCatalogFresh(future, fetchedAtMs)).toBe(false);
    expect(researchCatalogNeedsRefresh(future, fetchedAtMs)).toBe(false);
    expect(isResearchCatalogPastWindow(future, fetchedAtMs)).toBe(false);
    const unreadable = { fetchedAt: "not-a-date" };
    expect(isResearchCatalogFresh(unreadable, fetchedAtMs)).toBe(false);
    expect(researchCatalogNeedsRefresh(unreadable, fetchedAtMs)).toBe(false);
    expect(isResearchCatalogPastWindow(unreadable, fetchedAtMs)).toBe(false);
  });
});
