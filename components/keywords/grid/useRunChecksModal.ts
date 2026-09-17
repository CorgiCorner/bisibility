"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import type { KeywordDetailActions } from "@/components/keywords/action-utils";
import {
  keywordRunCheckId,
  keywordRunCheckOutcome,
} from "@/components/keywords/keyword-run-check-result";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import type { RankCheckBatchPollAction } from "@/components/keywords/use-rank-check-batch-poll";
import { useRankCheckBatchProgress } from "@/components/keywords/use-rank-check-batch-progress";
import type { GetRankCheckStatusesResult } from "@/lib/actions/rank-check-status";
import { type CostRateInfo, runCostCents } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { runCheckNowSchema } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { mapWithConcurrency } from "./bounded-dispatch";
import type { RunChecksFlow } from "./RunChecksConfirmationModal";
import { effectiveRowDepth } from "./run-check-depth";

const DISPATCH_CONCURRENCY = 5;

type Options = {
  onSettled: () => void;
  pollAction?: RankCheckBatchPollAction;
  projectId: string;
  providerRate?: CostRateInfo;
  rows: KeywordRow[];
  runCheckNowAction?: KeywordDetailActions["runCheckNowAction"];
};

type RunConfirmationMessages = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.runConfirmation">
>;

function blockMessage(code: string | null, t: RunConfirmationMessages) {
  if (code === "budget_exhausted") return t("budgetExhausted");
  if (code === "check_in_progress") return t("checkInProgress");
  if (code === "sample_project") return t("sampleProject");
  return t("startFailed");
}

function terminalFailure(result: GetRankCheckStatusesResult, t: RunConfirmationMessages) {
  if (result.status === "deferred") {
    return {
      code: "rank_check_deferred",
      message: t("deferred"),
      rankCheckId: null as string | null,
    };
  }
  if (result.errorCode === "not_found") {
    return {
      code: result.errorCode,
      message: t("runUnavailable"),
      rankCheckId: null as string | null,
    };
  }
  // Legacy billing rows need their stored detail to recover the durable restriction code
  // before localized UI copy replaces that untrusted provider detail.
  const providerCode = providerFailurePresentation(result.errorCode, result.error).code;
  return {
    code: providerCode ?? result.errorCode,
    message: t("runFailed"),
    rankCheckId: null as string | null,
  };
}

export function useRunChecksModal({
  onSettled,
  pollAction,
  projectId,
  providerRate,
  rows,
  runCheckNowAction,
}: Options) {
  const { addSpend } = useSessionSpend();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectRankTracker.keywordImport.management.runConfirmation");
  const [flow, setFlow] = useState<RunChecksFlow | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [activeRankCheckIds, setActiveRankCheckIds] = useState<string[]>([]);

  function request(keywordIds: string[], depth?: SerpDepth) {
    if (keywordIds.length === 0) return;
    setFlow({
      completed: 0,
      failures: [],
      pending: { ...(depth ? { depth } : {}), keywordIds },
      rankCheckIds: [],
      step: "confirm",
    });
  }

  function close() {
    if (flow?.step === "starting") return;
    setFlow(null);
  }

  function retry() {
    setFlow((previous) =>
      previous
        ? { ...previous, completed: 0, failures: [], rankCheckIds: [], step: "confirm" }
        : previous,
    );
  }

  async function confirm() {
    if (flow?.step !== "confirm" || !runCheckNowAction) return;
    const { depth, keywordIds } = flow.pending;
    setFlow((previous) => (previous ? { ...previous, step: "starting" } : previous));
    setPendingIds((previous) => new Set([...previous, ...keywordIds]));
    const results = await mapWithConcurrency(keywordIds, DISPATCH_CONCURRENCY, (keywordId) =>
      runCheckNowAction(runCheckNowSchema.parse(depth ? { depth, keywordId } : { keywordId })),
    );
    const failures: RunChecksFlow["failures"] = [];
    const rankCheckIds: string[] = [];
    let completed = 0;
    const successfulDepths: SerpDepth[] = [];
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (!result) continue;
      if (result.status === "rejected") {
        failures.push({
          code: null,
          message: presentSafeActionError(result.reason, sharedErrors, t("startFailed")),
          rankCheckId: null,
        });
        continue;
      }
      const outcome = keywordRunCheckOutcome(result.value);
      if (outcome === "blocked") {
        failures.push({
          code:
            "code" in (result.value as object)
              ? String((result.value as { code: unknown }).code)
              : null,
          message: blockMessage(
            "code" in (result.value as object)
              ? String((result.value as { code: unknown }).code)
              : null,
            t,
          ),
          rankCheckId: null,
        });
        continue;
      }
      const row = rows.find((candidate) => candidate.id === keywordIds[index]);
      successfulDepths.push(depth ?? (row ? effectiveRowDepth(row) : DEFAULT_SERP_DEPTH));
      if (outcome === "completed") {
        completed += 1;
        continue;
      }
      const rankCheckId = keywordRunCheckId(result.value);
      if (rankCheckId) rankCheckIds.push(rankCheckId);
      else
        failures.push({
          code: null,
          message: t("startFailed"),
          rankCheckId: null,
        });
    }
    const spend = providerRate ? runCostCents(successfulDepths, providerRate) : null;
    if (spend != null) addSpend(spend);
    const step = rankCheckIds.length > 0 ? "running" : failures.length > 0 ? "failed" : "success";
    if (rankCheckIds.length > 0) {
      setActiveRankCheckIds((previous) => [...new Set([...previous, ...rankCheckIds])]);
    }
    setFlow((previous) =>
      previous ? { ...previous, completed, failures, rankCheckIds, step } : previous,
    );
    setPendingIds((previous) => {
      const next = new Set(previous);
      for (const id of keywordIds) next.delete(id);
      return next;
    });
    onSettled();
  }

  function terminal(result: GetRankCheckStatusesResult) {
    setActiveRankCheckIds((previous) => previous.filter((id) => id !== result.rankCheckId));
    setFlow((previous) => {
      if (previous?.step !== "running" || !previous.rankCheckIds.includes(result.rankCheckId)) {
        return previous;
      }
      const rankCheckIds = previous.rankCheckIds.filter((id) => id !== result.rankCheckId);
      const completed = previous.completed + (result.status === "completed" ? 1 : 0);
      const failures =
        result.status === "completed"
          ? previous.failures
          : [
              ...previous.failures,
              { ...terminalFailure(result, t), rankCheckId: result.rankCheckId },
            ];
      const step = rankCheckIds.length > 0 ? "running" : failures.length > 0 ? "failed" : "success";
      return { ...previous, completed, failures, rankCheckIds, step };
    });
    onSettled();
  }

  useRankCheckBatchProgress({
    onTerminal: terminal,
    ...(pollAction ? { pollAction } : {}),
    projectId,
    rankCheckIds: activeRankCheckIds,
    total: activeRankCheckIds.length,
  });

  return { close, confirm, flow, pendingIds, request, retry };
}
