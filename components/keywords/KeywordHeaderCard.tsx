"use client";

import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { AddKeywordsMatrixInput, BulkKeywordIdsInput } from "@/lib/schemas/keyword";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { useState } from "react";
import type { KeywordAction, KeywordDetailActions } from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";
import { exportHistoryCsv } from "./keyword-history-export";
import { TargetSwitcher } from "./TargetSwitcher";
import { useKeywordScheduleModal } from "./use-keyword-schedule-modal";

type KeywordHeaderCardProps = KeywordDetailActions & {
  addKeywordsMatrixAction?: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  providerLabel?: string;
  rankState?: KeywordDetailRankState;
  searchConsoleConnected?: boolean;
  targets?: readonly KeywordRow[];
  tagSuggestions?: readonly string[];
};

export function KeywordHeaderCard({
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword,
  canUpdateKeyword,
  costContext,
  keyword,
  projectId,
  projectMarkets,
  providerLabel,
  rankState,
  searchConsoleConnected = false,
  targets = [keyword],
}: KeywordHeaderCardProps) {
  const [editing, setEditing] = useState(false);
  const effectiveDepth = resolveSerpDepth(keyword.projectSerpDepth);
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;
  const preflight = useRunPreflight({ projectId, providerId: costContext?.providerId });
  const runPending = preflight.opening;
  const canEditMarkets = canUpdateKeyword && projectMarkets && addKeywordsMatrixAction;
  const { onChangeSchedule, scheduleModal } = useKeywordScheduleModal({
    keyword,
    projectId,
    providerRate,
  });

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={
          <KeywordHeaderActions
            canUpdateKeyword={canUpdateKeyword}
            editing={editing}
            effectiveDepth={effectiveDepth}
            onExport={() => exportHistoryCsv(keyword)}
            onRunCheck={(depth) =>
              void preflight.request({
                depth,
                rows: [keyword],
                spec: { kind: "single", keywordId: keyword.id as `kw_${string}`, v: 1 },
              })
            }
            onToggleEdit={() => setEditing((value) => !value)}
            providerRate={providerRate}
            runPending={runPending}
          />
        }
        dimensionControls={
          <TargetSwitcher
            keyword={keyword}
            onEdit={canEditMarkets ? () => setEditing(true) : undefined}
            projectId={projectId}
            targets={targets}
          />
        }
        keyword={keyword}
        onChangeSchedule={canUpdateKeyword ? onChangeSchedule : undefined}
        providerLabel={providerLabel ?? costContext?.providerId ?? keyword.dataProvider}
        rankState={rankState}
        searchConsoleConnected={searchConsoleConnected}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      {preflight.dialog}
      {canEditMarkets ? (
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
      {scheduleModal}
    </>
  );
}
