"use client";

import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { exportHistoryCsv } from "./keyword-history-export";
import { useKeywordScheduleModal } from "./use-keyword-schedule-modal";

type KeywordHeaderCardProps = KeywordDetailActions & {
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  providerLabel?: string;
  rankState?: KeywordDetailRankState;
  searchConsoleConnected?: boolean;
  tagSuggestions?: readonly string[];
};

export function KeywordHeaderCard({
  canUpdateKeyword,
  costContext,
  keyword,
  projectId,
  projectMarkets,
  providerLabel,
  rankState,
  searchConsoleConnected = false,
  updateKeywordAction,
}: KeywordHeaderCardProps) {
  const [editing, setEditing] = useState(false);
  const effectiveDepth = resolveSerpDepth(keyword.projectSerpDepth);
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;
  const preflight = useRunPreflight({ projectId, providerId: costContext?.providerId });
  const runPending = preflight.opening;
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
        keyword={keyword}
        onChangeSchedule={canUpdateKeyword ? onChangeSchedule : undefined}
        providerLabel={providerLabel ?? costContext?.providerId ?? keyword.dataProvider}
        rankState={rankState}
        searchConsoleConnected={searchConsoleConnected}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      {preflight.dialog}
      {canUpdateKeyword ? (
        <KeywordEditDrawer
          key={keyword.id}
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          projectMarkets={projectMarkets}
          providerRate={providerRate}
          updateKeywordAction={updateKeywordAction}
        />
      ) : null}
      {scheduleModal}
    </>
  );
}
