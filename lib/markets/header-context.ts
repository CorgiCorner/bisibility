import {
  appPathContext,
  appSectionPath,
  type MarketRef,
  type ProjectRef,
} from "@/lib/routing/app-path";
import { hasMarketRoute } from "./market-route-sections";
import { resolvedContextDestination } from "./market-routes";

/**
 * One market as the HEADER names it: what it is called, which country-language pair it is, and
 * how much is tracked there. Deliberately narrower than `ProjectMarketsView`, which carries a
 * rate card the chrome would otherwise recompute on every page render.
 */
export type HeaderContextMarket = {
  countryCode: string;
  keywordCount: number;
  description?: string;
  status?: "active" | "paused";
  languageCode: string;
  name: string;
  ref: MarketRef;
};

/**
 * Past this many markets the switcher grows a search field. One named number, in one place: a
 * field that appears at an unstated count reads as a glitch, and a second copy of the rule is
 * how the count and the field drift apart.
 */
export const MARKET_SEARCH_THRESHOLD = 6;

/** Whether this many markets earns the search field. Strictly past the threshold. */
export function marketSearchVisible(marketCount: number): boolean {
  return marketCount > MARKET_SEARCH_THRESHOLD;
}

/**
 * What the header context slot has to show.
 *
 * `placeholder` is the second axis: `e/{engine}` already has a URL shape and no producer, so
 * the slot states the axis it is on rather than pretending the page is unscoped. `none` is
 * every page that carries no context at all, the account routes that mount the same shell
 * included - there the slot renders no element and no hairline.
 */
export type HeaderContextState =
  | { kind: "market"; market: HeaderContextMarket }
  | { kind: "all-markets" }
  | { kind: "none" }
  | { kind: "placeholder"; label: string };

const NO_CONTEXT: HeaderContextState = { kind: "none" };

/**
 * The URL decides, never a cookie and never a fetch of its own: the shell threads the market
 * LIST in, and which one of them the reader is inside is read straight back off the pathname,
 * exactly as the market layout resolved it server-side.
 */
export function headerContextState(
  pathname: string,
  markets: readonly HeaderContextMarket[],
): HeaderContextState {
  const context = appPathContext(pathname);
  if (context.kind === "engine") {
    return { kind: "placeholder", label: context.ref };
  }
  if (context.kind !== "market") {
    return hasMarketRoute(appSectionPath(pathname)) ? { kind: "all-markets" } : NO_CONTEXT;
  }
  const market = markets.find((candidate) => candidate.ref === context.ref);
  // A market the header cannot name is not one it can offer to leave. The route layer 404s an
  // unknown id and redirects an archived one, so reaching here means the threaded list is
  // stale - and a nameless trigger is worse than no trigger.
  return market ? { kind: "market", market } : NO_CONTEXT;
}

/** `US-en`: the country and the language a market pairs, in the codes the URL already uses. */
export function marketPairLabel(
  market: Readonly<Pick<HeaderContextMarket, "countryCode" | "languageCode">>,
): string {
  return `${market.countryCode.toUpperCase()}-${market.languageCode.toLowerCase()}`;
}

/** `12 kw`, or `empty` - a market with nothing in it says so rather than showing a zero. */
export function marketKeywordLabel(keywordCount: number): string {
  return keywordCount > 0 ? `${keywordCount} kw` : "empty";
}

/** One row of the market list: everything the popover renders, and nothing else. */
export type MarketRow = {
  countryCode?: string;
  countLabel: string;
  name: string;
  pair: string;
  description?: string;
  paused?: boolean;
  value: string;
};

/**
 * The rows for a search term. Name and pair are one haystack, so `US-en` finds the market its
 * row shows even though nothing spells that string out.
 */
export function marketRows(markets: readonly HeaderContextMarket[], search: string): MarketRow[] {
  const term = search.trim().toLocaleLowerCase("en-US");
  return markets
    .map((market) => ({
      countryCode: market.countryCode,
      countLabel: marketKeywordLabel(market.keywordCount),
      name: market.name,
      pair: marketPairLabel(market),
      description: market.description,
      paused: market.status === "paused",
      value: market.ref,
    }))
    .filter(
      (row) =>
        !term ||
        `${row.name} ${row.pair} ${row.description ?? ""}`
          .toLocaleLowerCase("en-US")
          .includes(term),
    );
}

function sectionSegments(pathname: string): string[] {
  return appSectionPath(pathname).split("/").filter(Boolean);
}

export type MarketSwitchInput = {
  marketRef: MarketRef;
  pathname: string;
  projectRef: ProjectRef;
};

/**
 * The same page, one market over. Built through `resolvedContextDestination` - the one gated
 * market-URL builder - so a section with no market route drops to the project level instead of
 * minting a URL whose only handler is the catch-all that redirects it straight back.
 *
 * The pathname alone is carried over. A query string is a within-page state (a tab, a filter)
 * that belongs to the market being left, and reading it here would need `useSearchParams` in
 * the shell, which opts the whole chrome out of static rendering.
 */
export function marketSwitchDestination({
  marketRef,
  pathname,
  projectRef,
}: Readonly<MarketSwitchInput>): string {
  return resolvedContextDestination({
    marketRef,
    projectRef,
    section: sectionSegments(pathname),
  });
}
