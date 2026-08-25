"use client";

import { AccentCtaLink } from "@/components/ui";
import { formatEstimateCents, runCostCents } from "@/lib/cost-estimate/project-estimate";
import type {
  KeywordDetailKeywordContext,
  KeywordDetailRankState,
  KeywordDetailWhatChanged,
} from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { ProjectRef } from "@/lib/routing/app-path";
import type {
  AddKeywordsInput,
  AddKeywordsMatrixInput,
  BulkKeywordIdsInput,
} from "@/lib/schemas/keyword";
import type { SerpDepth } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KeywordAction, KeywordDetailActions } from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordFirstCheckModal } from "./KeywordFirstCheckModal";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { KeywordMarketSwitcher } from "./KeywordMarketSwitcher";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";
import { emptyRankCopy } from "./KeywordPendingEmptyState";
import { KeywordPendingModules } from "./KeywordPendingModules";
import { exportHistoryCsv } from "./keyword-history-export";
import { useFirstCheckFlow } from "./use-first-check-flow";
import type { RankCheckPollAction } from "./use-rank-check-poll";

type KeywordPendingDetailProps = KeywordDetailActions & {
  addKeywordsAction?: KeywordAction<AddKeywordsInput>;
  addKeywordsMatrixAction?: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction?: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword?: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  keywordContext?: KeywordDetailKeywordContext;
  pollAction?: RankCheckPollAction;
  providerConnected: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  projectRef: ProjectRef;
  rankState?: Exclude<KeywordDetailRankState, "normal">;
  targets?: readonly KeywordRow[];
  whatChanged?: KeywordDetailWhatChanged;
};

function checkCostLabel(depth: SerpDepth, costContext?: ProjectCostContext) {
  if (!costContext) return null;
  const costCents = runCostCents([depth], {
    overrideCents: costContext.costPerCheckCents,
    providerId: costContext.providerId,
  });
  return costCents == null ? null : `~${formatEstimateCents(costCents)}`;
}

export function KeywordPendingDetail({
  addKeywordsAction,
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword = false,
  canUpdateKeyword,
  costContext,
  keyword,
  keywordContext,
  pollAction,
  providerConnected,
  projectId,
  projectMarkets,
  projectRef,
  rankState,
  runCheckNowAction,
  targets = [keyword],
  whatChanged,
}: Readonly<KeywordPendingDetailProps>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const {
    closeCheckModal,
    confirmRun,
    confirming,
    continueFromSuccess,
    modal,
    modalOpen,
    openCheckModal,
    tryAgain,
  } = useFirstCheckFlow({
    keywordId: keyword.id,
    pollAction,
    refresh: () => router.refresh(),
    runCheckNowAction,
  });
  const checkState =
    keyword.checkState ??
    (keyword.hasRankData
      ? "ranked"
      : keyword.lastCheckStatus === "failed" || keyword.lastCheckStatus === "running"
        ? keyword.lastCheckStatus
        : keyword.lastCheckStatus === "completed"
          ? "not_ranked"
          : "never_checked");
  const state = rankState ?? (checkState === "ranked" ? "not_ranked" : checkState);
  const copy = emptyRankCopy(state, projectRef, keyword.trackedDepth, providerConnected);
  const actionCopy = emptyRankCopy(
    state === "running" ? "never_checked" : state,
    projectRef,
    keyword.trackedDepth,
    providerConnected,
  );
  const defaultDepth: SerpDepth =
    state === "not_ranked" ? 100 : keyword.trackedDepth === 100 ? 100 : 20;
  const canRunCheck = providerConnected;
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;
  const linkLabel =
    typeof actionCopy.link === "function" ? actionCopy.link(defaultDepth) : actionCopy.link;

  const sharedActions = {
    canUpdateKeyword,
    editing,
    effectiveDepth: defaultDepth,
    onExport: () => exportHistoryCsv(keyword),
    onRunCheck: (depth: SerpDepth) => openCheckModal(depth),
    onToggleEdit: () => setEditing((value) => !value),
    providerRate,
    runPending: false,
  };
  const actions = canRunCheck ? (
    <KeywordHeaderActions {...sharedActions} primaryLabel={actionCopy.link} />
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <AccentCtaLink href={copy.href}>{linkLabel}</AccentCtaLink>
      <KeywordHeaderActions {...sharedActions} showCheck={false} />
    </div>
  );

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={actions}
        dimensionControls={
          addKeywordsAction && bulkDeleteAction ? (
            <KeywordMarketSwitcher
              addKeywordsAction={addKeywordsAction}
              bulkDeleteAction={bulkDeleteAction}
              canCreateKeyword={canCreateKeyword}
              keyword={keyword}
              projectId={projectId}
              projectMarkets={projectMarkets}
              targets={targets}
            />
          ) : undefined
        }
        keyword={keyword}
        providerId={costContext?.providerId}
        rankState={state}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      {canUpdateKeyword &&
      editing &&
      projectMarkets &&
      addKeywordsMatrixAction &&
      bulkDeleteAction ? (
        <KeywordMarketsDrawer
          addKeywordsMatrixAction={addKeywordsMatrixAction}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword={canCreateKeyword}
          keyword={keyword}
          onClose={() => setEditing(false)}
          projectId={projectId}
          projectMarkets={projectMarkets}
          targets={targets}
        />
      ) : null}
      <KeywordPendingModules
        copy={copy}
        keyword={keyword}
        keywordContext={keywordContext}
        state={state}
        whatChanged={whatChanged}
      />
      {modal ? (
        <KeywordFirstCheckModal
          confirmError={modal.error}
          confirming={confirming}
          costLabel={checkCostLabel(modal.depth, costContext)}
          depth={modal.depth}
          errorCode={modal.errorCode}
          onClose={closeCheckModal}
          onConfirm={() => void confirmRun()}
          onContinue={continueFromSuccess}
          onTryAgain={tryAgain}
          open={modalOpen}
          position={modal.position}
          projectRef={projectRef}
          rankCheckId={modal.rankCheckId}
          requestedDepth={modal.requestedDepth}
          step={modal.step}
        />
      ) : null}
    </>
  );
}
