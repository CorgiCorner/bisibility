"use client";

import { existingKeywordsFromRows } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import { ExportModal } from "@/components/keywords/export/ExportModal";
import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import type { AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";
import { useMemo } from "react";
import {
  defaultLocationSelection,
  deriveDomain,
  fallbackKeywordDefaults,
} from "./keyword-grid-defaults";

export type AddKeywordDraft = { keyword: string; open: boolean; tab: AddKeywordTab };

type KeywordsGridDialogsProps = Pick<KeywordWorkspaceActions, "addKeywordsAction"> & {
  addDraft: AddKeywordDraft;
  costContext?: ProjectCostContext;
  exportTarget: KeywordExportTarget | null;
  keywordDefaults?: ProjectDefaultMarket;
  onCloseAdd: () => void;
  onCloseExport: () => void;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  rows: KeywordRow[];
  tagSuggestions: readonly string[];
};

export function KeywordsGridDialogs({
  addDraft,
  addKeywordsAction,
  costContext,
  exportTarget,
  keywordDefaults,
  onCloseAdd,
  onCloseExport,
  projectId,
  projectMarkets,
  rows,
  tagSuggestions,
}: KeywordsGridDialogsProps) {
  const resolvedKeywordDefaults = keywordDefaults ?? fallbackKeywordDefaults;
  const existingKeywords = useMemo(
    () => (addDraft.open ? existingKeywordsFromRows(rows) : []),
    [addDraft.open, rows],
  );

  return (
    <>
      <AddKeywordDrawer
        addKeywordsAction={addKeywordsAction}
        costContext={costContext}
        defaultDevice={resolvedKeywordDefaults.device}
        defaultLocation={resolvedKeywordDefaults.country}
        defaultLocationSelection={defaultLocationSelection(resolvedKeywordDefaults)}
        domain={deriveDomain(rows)}
        existingKeywords={existingKeywords}
        initialKeyword={addDraft.keyword}
        initialTab={addDraft.tab}
        key={`${addDraft.tab}:${addDraft.keyword}`}
        onClose={onCloseAdd}
        open={addDraft.open}
        projectId={projectId}
        projectMarkets={projectMarkets}
        tagSuggestions={tagSuggestions}
      />
      {exportTarget ? (
        <ExportModal onClose={onCloseExport} open projectId={projectId} target={exportTarget} />
      ) : null}
    </>
  );
}
