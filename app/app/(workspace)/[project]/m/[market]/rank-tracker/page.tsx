import KeywordsPage from "@/app/app/(workspace)/[project]/rank-tracker/page";
import { requireMarketContext } from "@/lib/markets/market-context";
import { marketPath } from "@/lib/routing/app-path";

type MarketRankTrackerPageProps = {
  params: Promise<{ market: string; project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketRankTrackerPage({
  params,
  searchParams,
}: Readonly<MarketRankTrackerPageProps>) {
  const routeParams = await params;
  const marketContext = await requireMarketContext(routeParams.project, routeParams.market);

  return KeywordsPage({
    marketLocationKey: marketContext.locationKey,
    params: Promise.resolve(routeParams),
    rankTrackerPath: marketPath(routeParams.project, routeParams.market, "rank-tracker"),
    searchParams,
  });
}
