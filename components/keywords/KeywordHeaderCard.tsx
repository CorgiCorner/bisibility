"use client";

import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { AddKeywordsMatrixInput, BulkKeywordIdsInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AddKeywordsInput, KeywordAction, KeywordDetailActions } from "./action-utils";
import { RunChecksConfirmationModal } from "./grid/RunChecksConfirmationModal";
import { useRunChecksModal } from "./grid/useRunChecksModal";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { KeywordMarketSwitcher } from "./KeywordMarketSwitcher";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";
import { exportHistoryCsv } from "./keyword-history-export";

type KeywordHeaderCardProps = KeywordDetailActions & {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  addKeywordsMatrixAction?: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  targets?: readonly KeywordRow[];
  tagSuggestions?: readonly string[];
};

export function KeywordHeaderCard({
  addKeywordsAction,
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword,
  canUpdateKeyword,
  costContext,
  keyword,
  projectId,
  projectMarkets,
  runCheckNowAction,
  targets = [keyword],
}: KeywordHeaderCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const effectiveDepth =
    keyword.schedule?.serp_depth ?? keyword.projectSerpDepth ?? DEFAULT_SERP_DEPTH;
  const providerRate = costContext
    ? {
        overrideCents: costContext.costPerCheckCents,
        providerId: costContext.providerId,
      }
    : undefined;
  const runChecks = useRunChecksModal({
    onSettled: router.refresh,
    projectId,
    providerRate,
    rows: [keyword],
    runCheckNowAction,
  });
  const runPending = runChecks.pendingIds.has(keyword.id) || runChecks.flow?.step === "starting";

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={
          <KeywordHeaderActions
            canUpdateKeyword={canUpdateKeyword}
            editing={editing}
            effectiveDepth={effectiveDepth}
            onExport={() => exportHistoryCsv(keyword)}
            onRunCheck={(depth) => runChecks.request([keyword.id], depth)}
            onToggleEdit={() => setEditing((value) => !value)}
            providerRate={providerRate}
            runPending={runPending}
          />
        }
        dimensionControls={
          <KeywordMarketSwitcher
            addKeywordsAction={addKeywordsAction}
            bulkDeleteAction={bulkDeleteAction}
            canCreateKeyword={canCreateKeyword}
            keyword={keyword}
            projectId={projectId}
            projectMarkets={projectMarkets}
            targets={targets}
          />
        }
        keyword={keyword}
        providerId={costContext?.providerId}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      <RunChecksConfirmationModal
        flow={runChecks.flow}
        onClose={runChecks.close}
        onConfirm={() => void runChecks.confirm()}
        onRetry={runChecks.retry}
        projectId={projectId}
        providerRate={providerRate}
        rows={[keyword]}
      />
      {canUpdateKeyword && projectMarkets && addKeywordsMatrixAction ? (
        <KeywordMarketsDrawer
          addKeywordsMatrixAction={addKeywordsMatrixAction}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword={canCreateKeyword}
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          projectMarkets={projectMarkets}
          targets={targets}
        />
      ) : null}
    </>
  );
}
