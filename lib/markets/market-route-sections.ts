/**
 * The ONE list of sections that render under `m/{market}` today, as the exact section paths
 * `appSectionPath` produces.
 *
 * `page-scope` answers a different question: whether a section COULD be scoped to a market at
 * all. Almost every page can be, and the market route layer implements almost none of them
 * yet, so the two answers must not be confused. Promoting a URL to the market level on the
 * scope answer alone sent `~/competitors` - a normal navigation with a last-market cookie set -
 * to a market URL whose only handler is the catch-all, which 404s it.
 *
 * So every market URL this app builds is gated on THIS list, and the market route layer serves
 * anything absent from it at the project level. Adding a market route means adding its section
 * here in the same change: `market-route-sections.test.ts` derives the real route set from the
 * route files and fails when the two disagree, in either direction.
 */
export const MARKET_ROUTE_SECTIONS = ["/rank-tracker"] as const;

const MARKET_ROUTE_SECTION_SET: ReadonlySet<string> = new Set(MARKET_ROUTE_SECTIONS);

/**
 * Route segments joined into the section-path form the rest of this module compares against,
 * so a `[...page]` array and a parsed pathname reach the same verdict. The project root has no
 * section and is the empty string, exactly as `appSectionPath` renders it.
 */
export function sectionPathOf(section: readonly string[]): string {
  const segments = section.filter(Boolean);
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

/**
 * Whether this exact section renders under the market segment. Exact, not by section head: the
 * keyword detail page has no market route even though `/rank-tracker` does, and treating it as
 * routed would send it to the same 404 this list exists to prevent.
 */
export function hasMarketRoute(sectionPath: string): boolean {
  return MARKET_ROUTE_SECTION_SET.has(sectionPath);
}
