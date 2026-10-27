"use client";
import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { type AddKeywordDraft, KeywordsGridDialogs } from "./KeywordsGridDialogs";
import { pickGridProps } from "./keywords-grid-projection";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { RankTrackerCommandMarker } from "./useRankTrackerCommands";

const dialogProps = [
  "addDraft",
  "addKeywordsAction",
  "costContext",
  "exportTarget",
  "keywordDefaults",
  "projectId",
  "projectMarkets",
] as const;
const commandProps = [
  "canCreateKeyword",
  "canUpdateKeyword",
  "exportSupported",
  "onExport",
  "onFilter",
  "onImport",
  "onRunChecks",
] as const;
type Props = Pick<Parameters<typeof KeywordsGridDialogs>[0], (typeof dialogProps)[number]> &
  Pick<Parameters<typeof RankTrackerCommandMarker>[0], (typeof commandProps)[number]> &
  Pick<
    KeywordsGridProps,
    "checkHealth" | "getFirstCheckRunPlanAction" | "initialAction" | "tagSuggestions"
  > & {
    marketScope?: MarketScope | null;
    openAddDrawer: (keyword?: string, tab?: AddKeywordDraft["tab"]) => void;
    pendingRows: number;
    preflightDialog: ReactNode;
    requestRows: KeywordsGridProps["rows"];
    scopedRows?: number;
    setAddDraft: Dispatch<SetStateAction<AddKeywordDraft>>;
    setExportTarget: Dispatch<SetStateAction<KeywordExportTarget | null>>;
  };
export function KeywordsGridDialogBundle(props: Props) {
  const { marketScope = null, setAddDraft, setExportTarget } = props;
  return (
    <>
      {props.canCreateKeyword || props.exportTarget ? (
        <KeywordsGridDialogs
          {...pickGridProps(props, dialogProps)}
          initialMarketKeys={marketScope ? [marketScope.canonicalKey] : undefined}
          onCloseAdd={() => setAddDraft((current) => ({ ...current, open: false }))}
          onExitedAdd={() => setAddDraft({ keyword: "", open: false, tab: "manual" })}
          onCloseExport={() => setExportTarget(null)}
          rows={props.requestRows}
          tagSuggestions={props.tagSuggestions ?? []}
        />
      ) : null}
      {props.preflightDialog}
      <RankTrackerCommandMarker
        {...pickGridProps(props, commandProps)}
        initialAction={props.initialAction ?? null}
        marketScope={marketScope}
        onAdd={props.openAddDrawer}
        rowCounts={{
          all: props.requestRows.length,
          scoped: props.scopedRows,
          visible: props.pendingRows,
        }}
      />
    </>
  );
}
