"use client";

import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { formatEstimateCents, runCostCents } from "@/lib/cost-estimate/project-estimate";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordFirstCheckModal } from "./KeywordFirstCheckModal";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { emptyRankCopy } from "./KeywordPendingEmptyState";
import { KeywordPendingModules } from "./KeywordPendingModules";
import { exportHistoryCsv } from "./keyword-history-export";
import { useFirstCheckFlow } from "./use-first-check-flow";
import { useKeywordScheduleModal } from "./use-keyword-schedule-modal";
import type { RankCheckPollAction } from "./use-rank-check-poll";

type KeywordPendingDetailProps = KeywordDetailActions & {
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  pollAction?: RankCheckPollAction;
  providerConnected: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  projectRef: string;
  providerLabel?: string;
  rankState?: Exclude<KeywordDetailRankState, "normal">;
  searchConsoleConnected?: boolean;
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
  canUpdateKeyword,
  costContext,
  keyword,
  pollAction,
  providerConnected,
  projectId,
  projectMarkets,
  projectRef,
  providerLabel,
  rankState,
  runCheckNowAction,
  searchConsoleConnected = false,
  updateKeywordAction,
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
  const defaultDepth = resolveSerpDepth(keyword.projectSerpDepth);
  const copy = emptyRankCopy(state, projectRef, defaultDepth, providerConnected);
  const canRunCheck = providerConnected;
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;
  const { onChangeSchedule, scheduleModal } = useKeywordScheduleModal({
    keyword,
    projectId,
    providerRate,
  });
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
    <KeywordHeaderActions {...sharedActions} />
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <AccentCtaLink href={copy.href}>Connect a provider</AccentCtaLink>
      <KeywordHeaderActions {...sharedActions} showCheck={false} />
    </div>
  );

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={actions}
        keyword={keyword}
        onChangeSchedule={canUpdateKeyword ? onChangeSchedule : undefined}
        providerLabel={providerLabel ?? costContext?.providerId ?? keyword.dataProvider}
        rankState={state}
        searchConsoleConnected={searchConsoleConnected}
        timeZone={costContext?.timezone ?? "UTC"}
      />
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
      <KeywordPendingModules copy={copy} state={state} />
      {scheduleModal}
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
