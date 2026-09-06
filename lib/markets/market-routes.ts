import { isPublicIdOfType } from "@/lib/db/public-id";
import { appPath, type MarketRef, marketPath, type ProjectRef } from "@/lib/routing/app-path";
import { hasMarketRoute, sectionPathOf } from "./market-route-sections";

/** The project-scoped page where markets are managed. */
export const MARKETS_SECTION = "markets";

/** Carries the one-time note the markets route renders after an archived market was opened. */
export const ARCHIVED_MARKET_NOTE_PARAM = "archived-market";

/** The legacy within-page lens the rank tracker used before the market became a level. */
export const LEGACY_MARKET_PARAM = "market";

/** Next hands route search params as a record; every destination below needs a query. */
export function routeSearchParams(
  params: Record<string, string | string[] | undefined> | undefined,
): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, raw] of Object.entries(params ?? {})) {
    for (const value of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) {
      result.append(key, value);
    }
  }
  return result;
}

/** The first value of a repeated search param, which is the one a route acts on. */
export function routeSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withSearch(path: string, search: URLSearchParams | undefined): string {
  const query = search?.toString() ?? "";
  return query ? `${path}?${query}` : path;
}

/**
 * The archived-market note echoes an id that arrived in a query string, so the value is read
 * back through this and not straight out of `searchParams`: anything that is not a market
 * publicId names no market and gets no note.
 */
export function archivedMarketNoteRef(value: string | string[] | undefined): string | null {
  const marketRef = routeSearchValue(value);
  return marketRef && isPublicIdOfType(marketRef, "pmkt") ? marketRef : null;
}

/** An archived market id lands on the markets route with the note, never on a dead page. */
export function archivedMarketDestination(projectRef: ProjectRef, marketRef: string): string {
  return withSearch(
    appPath(projectRef, MARKETS_SECTION),
    new URLSearchParams({ [ARCHIVED_MARKET_NOTE_PARAM]: marketRef }),
  );
}

export type ResolvedContextInput = {
  marketRef: MarketRef | null;
  projectRef: ProjectRef;
  search?: URLSearchParams;
  section: readonly string[];
};

/**
 * `~` never guesses, and it never promotes a page to a URL that has no route. A section drops
 * to the project route unless it is in `MARKET_ROUTE_SECTIONS`, which covers both a page that
 * describes the project itself and a page that measures a market but has no market route yet.
 * An absent or unresolvable market drops there too - the caller resolves the cookie to a
 * market of THIS project before calling, or passes null.
 *
 * This is the only function that builds a market URL from a section, so the gate cannot be
 * bypassed by a second list somewhere else.
 */
export function resolvedContextDestination({
  marketRef,
  projectRef,
  search,
  section,
}: ResolvedContextInput): string {
  const segments = section.filter(Boolean);
  if (!marketRef || !hasMarketRoute(sectionPathOf(segments))) {
    return withSearch(appPath(projectRef, ...segments), search);
  }
  return withSearch(marketPath(projectRef, marketRef, ...segments), search);
}

export type MarketScopeCorrectionInput = {
  projectRef: ProjectRef;
  search?: URLSearchParams;
  section: readonly string[];
};

/**
 * Where a page reached under a market segment belongs when no market route matched it. That
 * is one destination, not two: a page describing the project itself is the same page in every
 * market, and a page that measures a market but has no market route yet still only exists at
 * the project level. Sending both there keeps the market layer from inventing a 404 for a URL
 * that renders one segment away, and leaves the project route as the single authority on
 * whether the page exists at all.
 */
export function marketScopeCorrection({
  projectRef,
  search,
  section,
}: MarketScopeCorrectionInput): string {
  return withSearch(appPath(projectRef, ...section.filter(Boolean)), search);
}

export type LegacyMarketInput = {
  marketRef: MarketRef | null;
  projectRef: ProjectRef;
  search: URLSearchParams;
};

/**
 * `?market=` on the rank tracker predates the segment and meant a within-page lens. It is
 * promoted to the level it always described; when it names nothing this project still
 * tracks, the param is dropped rather than left to act as a silent filter. Returns null when
 * there is no legacy param to migrate.
 */
export function legacyMarketDestination({
  marketRef,
  projectRef,
  search,
}: LegacyMarketInput): string | null {
  if (!search.has(LEGACY_MARKET_PARAM)) {
    return null;
  }
  const rest = new URLSearchParams(search);
  rest.delete(LEGACY_MARKET_PARAM);
  // Routed through the same builder as `~`, so the promotion cannot outlive the route.
  return resolvedContextDestination({
    marketRef,
    projectRef,
    search: rest,
    section: ["rank-tracker"],
  });
}
