"use client";

import { existingKeywordsFromRows } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import type { AddKeywordEntryTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  defaultLocationSelection,
  deriveDomain,
  fallbackKeywordDefaults,
} from "./keyword-grid-defaults";

const AddKeywordDrawer = dynamic(
  () =>
    import("@/components/keywords/add/AddKeywordDrawer").then((module) => module.AddKeywordDrawer),
  { ssr: false },
);
const ExportModal = dynamic(
  () => import("@/components/keywords/export/ExportModal").then((module) => module.ExportModal),
  { ssr: false },
);

export type AddKeywordDraft = { keyword: string; open: boolean; tab: AddKeywordEntryTab };

type KeywordsGridDialogsProps = Pick<KeywordWorkspaceActions, "addKeywordsAction"> & {
  addDraft: AddKeywordDraft;
  costContext?: ProjectCostContext;
  exportTarget: KeywordExportTarget | null;
  keywordDefaults?: ProjectDefaultMarket;
  initialMarketKeys?: string[];
  onCloseAdd: () => void;
  onExitedAdd?: () => void;
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
  initialMarketKeys,
  onCloseAdd,
  onExitedAdd,
  onCloseExport,
  projectId,
  projectMarkets,
  rows,
  tagSuggestions,
}: KeywordsGridDialogsProps) {
  const [hasOpenedAdd, setHasOpenedAdd] = useState(addDraft.open);
  if (addDraft.open && !hasOpenedAdd) setHasOpenedAdd(true);
  const resolvedKeywordDefaults = keywordDefaults ?? fallbackKeywordDefaults;
  const existingKeywords = useMemo(() => existingKeywordsFromRows(rows), [rows]);

  return (
    <>
      {/* Keep an opened drawer mounted so its exit and form reset can complete. */}
      {hasOpenedAdd ? (
        <AddKeywordDrawer
          addKeywordsAction={addKeywordsAction}
          costContext={costContext}
          defaultDevice={resolvedKeywordDefaults.device}
          defaultLocation={resolvedKeywordDefaults.country}
          defaultLocationSelection={defaultLocationSelection(resolvedKeywordDefaults)}
          domain={deriveDomain(rows)}
          existingKeywords={existingKeywords}
          initialKeyword={addDraft.keyword}
          initialMarketKeys={initialMarketKeys}
          initialTab={addDraft.tab}
          key={`${addDraft.tab}:${addDraft.keyword}`}
          onClose={onCloseAdd}
          onExited={onExitedAdd}
          open={addDraft.open}
          projectId={projectId}
          projectMarkets={projectMarkets}
          tagSuggestions={tagSuggestions}
        />
      ) : null}
      {exportTarget ? (
        <ExportModal onClose={onCloseExport} open projectId={projectId} target={exportTarget} />
      ) : null}
    </>
  );
}
