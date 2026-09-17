import { requireMarketContext } from "@/lib/markets/market-context";
import { marketScopeCorrection, routeSearchParams } from "@/lib/markets/market-routes";
import { permanentRedirect } from "next/navigation";

type MarketScopeFallbackProps = {
  params: Promise<{ market: string; page: string[]; project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Any page reached under a market that has no market route. The market is validated FIRST, so
 * an unknown or other-project id answers 404 instead of being corrected into a redirect that
 * would confirm the id exists. Only then is the page moved to the project level, where it
 * either renders or 404s on its own merits - this route never decides that for it, because the
 * page it is asked for may exist one segment away and answering 404 here would hide it.
 *
 * The query travels with the reader: it carries the tab, the filter and the anchor they
 * followed, and a redirect that drops it is a silent loss, not a tidy-up.
 */
export default async function MarketScopeFallbackPage({
  params,
  searchParams,
}: Readonly<MarketScopeFallbackProps>) {
  const { market, page, project } = await params;
  const context = await requireMarketContext(project, market);

  permanentRedirect(
    marketScopeCorrection({
      projectRef: context.projectRef,
      search: routeSearchParams(await searchParams),
      section: page ?? [],
    }),
  );
}
