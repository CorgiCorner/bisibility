"use client";

import { KeywordDetailFreeActionButton } from "@/components/keyword-detail/shared";
import { useToast } from "@/components/ui";
import type {
  KeywordDetailKeywordContext,
  KeywordDetailRankState,
  KeywordDetailWhatChanged,
} from "@/lib/keyword-detail/state-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import { CaretRightIcon as CaretRight, SpinnerGapIcon as SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  actionErrorMessage,
  type CreateKeywordAlertInput,
  type KeywordDetailActions,
} from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { emptyRankCopy } from "./KeywordPendingEmptyState";
import { KeywordPendingModules } from "./KeywordPendingModules";
import { exportHistoryCsv } from "./keyword-history-export";

type KeywordPendingDetailProps = KeywordDetailActions & {
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  keywordContext?: KeywordDetailKeywordContext;
  providerConnected: boolean;
  projectId: string;
  projectRef: ProjectRef;
  rankState?: Exclude<KeywordDetailRankState, "normal">;
  whatChanged?: KeywordDetailWhatChanged;
};

export function KeywordPendingDetail({
  canUpdateKeyword,
  costContext,
  createKeywordAlertAction,
  keyword,
  keywordContext,
  projectId,
  projectRef,
  providerConnected,
  rankState,
  runCheckNowAction,
  updateKeywordAction,
  updateKeywordScheduleAction,
  whatChanged,
}: Readonly<KeywordPendingDetailProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [alertStatus, setAlertStatus] = useState<"created" | "creating" | "idle">("idle");
  const [editing, setEditing] = useState(false);
  const [runPending, setRunPending] = useState(false);
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
  const defaultDepth: SerpDepth =
    state === "not_ranked" ? 100 : keyword.trackedDepth === 100 ? 100 : 20;
  const alertCreated = alertStatus === "created";
  const alertCreating = alertStatus === "creating";
  const canRunCheck = state !== "running" && providerConnected;
  const providerRate = costContext
    ? { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId }
    : undefined;

  async function createAlert() {
    if (!createKeywordAlertAction || alertCreated || alertCreating) return;
    setAlertStatus("creating");
    try {
      await createKeywordAlertAction({
        keywordId: keyword.id,
        projectId,
      } satisfies CreateKeywordAlertInput);
      setAlertStatus("created");
      showToast("Alert created", { tint: "green" });
      router.refresh();
    } catch (error) {
      setAlertStatus("idle");
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  async function runCheck(depth: SerpDepth) {
    setRunPending(true);
    try {
      const result = await runCheckNowAction({ depth, keywordId: keyword.id });
      if (isBudgetExhaustedResult(result)) {
        showToast(result.message, { tint: "red" });
        return;
      }
      showToast("Check started", { tint: "green" });
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    } finally {
      setRunPending(false);
    }
  }

  const sharedActions = {
    alertCreated,
    alertCreating,
    canCreateAlert: Boolean(createKeywordAlertAction),
    canUpdateKeyword,
    editing,
    effectiveDepth: defaultDepth,
    onCreateAlert: () => void createAlert(),
    onExport: () => exportHistoryCsv(keyword),
    onRunCheck: (depth: SerpDepth) => void runCheck(depth),
    onToggleEdit: () => setEditing((value) => !value),
    providerRate,
    runPending,
  };
  const actions = canRunCheck ? (
    <KeywordHeaderActions {...sharedActions} primaryLabel={copy.link} />
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      {state === "running" ? (
        <KeywordDetailFreeActionButton onClick={() => router.refresh()}>
          <SpinnerGap aria-hidden className="bv-spin" size={15} weight="bold" />
          Refresh
        </KeywordDetailFreeActionButton>
      ) : (
        <Link
          className="inline-flex items-center gap-[7px] rounded-[10px] bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-[color:var(--accent-on-solid)] hover:bg-accent-solid-hover"
          href={copy.href}
        >
          {copy.link}
          <CaretRight size={14} weight="bold" />
        </Link>
      )}
      <KeywordHeaderActions {...sharedActions} showCheck={false} />
    </div>
  );

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={actions}
        keyword={keyword}
        providerId={costContext?.providerId}
        rankState={state}
      />
      {canUpdateKeyword ? (
        <KeywordEditDrawer
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          providerRate={providerRate}
          updateKeywordAction={updateKeywordAction}
          updateKeywordScheduleAction={updateKeywordScheduleAction}
        />
      ) : null}
      <KeywordPendingModules
        copy={copy}
        keyword={keyword}
        keywordContext={keywordContext}
        state={state}
        whatChanged={whatChanged}
      />
    </>
  );
}
