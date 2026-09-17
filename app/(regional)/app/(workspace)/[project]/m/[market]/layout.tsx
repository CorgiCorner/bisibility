import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import { requireMarketContext } from "@/lib/markets/market-context";
import type { ReactNode } from "react";

type MarketLayoutProps = {
  children: ReactNode;
  params: Promise<{ market: string; project: string }>;
};

/**
 * The market level. It resolves the segment once per request and hands the result down; it
 * deliberately reads no cookie, so the same URL renders the same page for everybody. The
 * `last-market` cookie is written by middleware, one layer above this render.
 */
export default async function MarketLayout({ children, params }: Readonly<MarketLayoutProps>) {
  const { market, project } = await params;
  const context = await requireMarketContext(project, market);

  return (
    <MarketContextProvider market={context.market} projectRef={context.projectRef}>
      {children}
    </MarketContextProvider>
  );
}
