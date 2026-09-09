"use client";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { ReactNode } from "react";
import type { AddKeywordDraft } from "./KeywordsGridDialogs";
import { KeywordsGridMarketEmpty } from "./KeywordsGridMarketEmpty";
import { KeywordsGridProjectEmpty } from "./KeywordsGridProjectEmpty";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Props = Pick<
  KeywordsGridProps,
  | "canCreateKeyword"
  | "canManageProviders"
  | "costContext"
  | "importTopQueriesAction"
  | "providerConnected"
  | "projectId"
  | "projectMarkets"
  | "searchConsoleConnected"
> & {
  dialogs: ReactNode;
  marketScope: MarketScope | null;
  onImportCsv: () => void;
  openAddDrawer: (keyword?: string, tab?: AddKeywordDraft["tab"]) => void;
};

/**
 * Which "nothing here yet" the reader gets. Standing inside a market and being told about the
 * project is what made the old copy misleading, so the market level answers in its own terms;
 * the project level is left byte-for-byte as it was.
 */
export function KeywordsGridEmpty(props: Props) {
  if (props.marketScope) {
    return (
      <KeywordsGridMarketEmpty
        canCreateKeyword={props.canCreateKeyword}
        dialogs={props.dialogs}
        marketLabel={props.marketScope.label}
        paused={props.marketScope.status === "paused"}
        onAddKeyword={() => props.openAddDrawer()}
        projectRef={props.projectId}
      />
    );
  }
  return (
    <KeywordsGridProjectEmpty
      canCreateKeyword={props.canCreateKeyword}
      canManageProviders={props.canManageProviders}
      costContext={props.costContext}
      dialogs={props.dialogs}
      importTopQueriesAction={props.importTopQueriesAction}
      onAddKeyword={() => props.openAddDrawer()}
      onImportCsv={props.onImportCsv}
      openAddDrawer={props.openAddDrawer}
      projectId={props.projectId}
      hasMarkets={props.projectMarkets === undefined || props.projectMarkets.markets.length > 0}
      searchConsoleConnected={props.searchConsoleConnected}
    />
  );
}
