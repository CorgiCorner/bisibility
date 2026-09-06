"use client";

import type { MarketContextValue } from "@/lib/markets/market-context-value";
import { projectLevelContext } from "@/lib/markets/market-context-value";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

const MarketContext = createContext<MarketContextValue>(projectLevelContext(""));

/**
 * Hands client components the context the server already resolved from the URL. There is no
 * second fetch and no effect: the value arrives as a prop from the layout that resolved it.
 */
export function MarketContextProvider({
  children,
  market,
  projectRef,
}: Readonly<{
  children: ReactNode;
  market: MarketContextValue["market"];
  projectRef: string;
}>) {
  const value = useMemo(() => ({ market, projectRef }), [market, projectRef]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarketContext(): MarketContextValue {
  return useContext(MarketContext);
}

/** True when the page is scoped to a market rather than to the project as a whole. */
export function useIsMarketScoped(): boolean {
  return useMarketContext().market !== null;
}
