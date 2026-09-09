"use client";
import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { type AddKeywordDraft, KeywordsGridDialogs } from "./KeywordsGridDialogs";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { RankTrackerCommandMarker } from "./useRankTrackerCommands";

type Props = Pick<
  KeywordsGridProps,
  | "addKeywordsAction"
  | "canCreateKeyword"
  | "canUpdateKeyword"
  | "checkHealth"
  | "costContext"
  | "getFirstCheckRunPlanAction"
  | "initialAction"
  | "keywordDefaults"
  | "projectId"
  | "projectMarkets"
  | "queueFirstChecksAction"
  | "tagSuggestions"
> & {
  addDraft: AddKeywordDraft;
  exportTarget: KeywordExportTarget | null;
  marketScope?: MarketScope | null;
  onExport: () => void;
  onFilter: () => void;
  onImport: () => void;
  onRunChecks: () => void;
  openAddDrawer: (keyword?: string, tab?: AddKeywordDraft["tab"]) => void;
  pendingRows: number;
  preflightDialog: ReactNode;
  requestRows: KeywordsGridProps["rows"];
  scopedRows?: number;
  setAddDraft: Dispatch<SetStateAction<AddKeywordDraft>>;
  setExportTarget: Dispatch<SetStateAction<KeywordExportTarget | null>>;
};
export function KeywordsGridDialogBundle(props: Props) {
  const {
    addDraft,
    addKeywordsAction,
    canCreateKeyword,
    canUpdateKeyword,
    costContext,
    exportTarget,
    initialAction,
    keywordDefaults,
    marketScope = null,
    onExport,
    onFilter,
    onImport,
    onRunChecks,
    openAddDrawer,
    pendingRows,
    preflightDialog,
    scopedRows,
    projectId,
    projectMarkets,
    requestRows,
    setAddDraft,
    setExportTarget,
    tagSuggestions,
  } = props;
  return (
    <>
      {canCreateKeyword || exportTarget ? (
        <KeywordsGridDialogs
          addDraft={addDraft}
          addKeywordsAction={addKeywordsAction}
          exportTarget={exportTarget}
          costContext={costContext}
          keywordDefaults={keywordDefaults}
          initialMarketKeys={marketScope ? [marketScope.canonicalKey] : undefined}
          onCloseAdd={() => setAddDraft((current) => ({ ...current, open: false }))}
          onExitedAdd={() => setAddDraft({ keyword: "", open: false, tab: "manual" })}
          onCloseExport={() => setExportTarget(null)}
          projectId={projectId}
          projectMarkets={projectMarkets}
          rows={requestRows}
          tagSuggestions={tagSuggestions ?? []}
        />
      ) : null}
      {preflightDialog}
      <RankTrackerCommandMarker
        canCreateKeyword={canCreateKeyword}
        canUpdateKeyword={canUpdateKeyword}
        initialAction={initialAction ?? null}
        marketScope={marketScope}
        onAdd={openAddDrawer}
        onExport={onExport}
        onFilter={onFilter}
        onImport={onImport}
        onRunChecks={onRunChecks}
        rowCounts={{ all: requestRows.length, scoped: scopedRows, visible: pendingRows }}
      />
    </>
  );
}
