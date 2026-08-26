"use client";
import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import type { Dispatch, SetStateAction } from "react";
import { type AddKeywordDraft, KeywordsGridDialogs } from "./KeywordsGridDialogs";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { RunChecksConfirmationModal } from "./RunChecksConfirmationModal";
import { RankTrackerCommandMarker } from "./useRankTrackerCommands";
import type { useRunChecksModal } from "./useRunChecksModal";

type RunFlow = ReturnType<typeof useRunChecksModal>;
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
  closeRunChecks: RunFlow["close"];
  confirmRunChecks: RunFlow["confirm"];
  exportTarget: KeywordExportTarget | null;
  onExport: () => void;
  onFilter: () => void;
  onImport: () => void;
  onRunChecks: () => void;
  openAddDrawer: (keyword?: string, tab?: AddKeywordDraft["tab"]) => void;
  pendingRows: number;
  requestRows: KeywordsGridProps["rows"];
  retryRunChecks: RunFlow["retry"];
  runChecksFlow: RunFlow["flow"];
  setAddDraft: Dispatch<SetStateAction<AddKeywordDraft>>;
  setExportTarget: Dispatch<SetStateAction<KeywordExportTarget | null>>;
};
export function KeywordsGridDialogBundle(props: Props) {
  const {
    addDraft,
    addKeywordsAction,
    canCreateKeyword,
    canUpdateKeyword,
    checkHealth,
    closeRunChecks,
    confirmRunChecks,
    costContext,
    exportTarget,
    initialAction,
    keywordDefaults,
    onExport,
    onFilter,
    onImport,
    onRunChecks,
    openAddDrawer,
    pendingRows,
    projectId,
    projectMarkets,
    requestRows,
    retryRunChecks,
    runChecksFlow,
    setAddDraft,
    setExportTarget,
    tagSuggestions,
  } = props;
  return (
    <>
      {(canCreateKeyword && addDraft.open) || exportTarget ? (
        <KeywordsGridDialogs
          addDraft={addDraft}
          addKeywordsAction={addKeywordsAction}
          exportTarget={exportTarget}
          costContext={costContext}
          keywordDefaults={keywordDefaults}
          onCloseAdd={() => setAddDraft({ keyword: "", open: false, tab: "manual" })}
          onCloseExport={() => setExportTarget(null)}
          projectId={projectId}
          projectMarkets={projectMarkets}
          rows={requestRows}
          tagSuggestions={tagSuggestions ?? []}
        />
      ) : null}
      <RunChecksConfirmationModal
        flow={runChecksFlow}
        onClose={closeRunChecks}
        onConfirm={() => void confirmRunChecks()}
        onRetry={retryRunChecks}
        projectId={projectId}
        providerRate={checkHealth?.providerRate}
        rows={requestRows}
      />
      <RankTrackerCommandMarker
        canCreateKeyword={canCreateKeyword}
        canUpdateKeyword={canUpdateKeyword}
        initialAction={initialAction ?? null}
        onAdd={openAddDrawer}
        onExport={onExport}
        onFilter={onFilter}
        onImport={onImport}
        onRunChecks={onRunChecks}
        rowCounts={{ all: requestRows.length, visible: pendingRows }}
      />
    </>
  );
}
