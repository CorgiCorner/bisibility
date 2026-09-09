"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { actionErrorMessage, type KeywordDetailActions } from "@/components/keywords/action-utils";
import {
  keywordRunCheckBlockMessage,
  keywordRunCheckId,
  keywordRunCheckOutcome,
} from "@/components/keywords/keyword-run-check-result";
import type { RankCheckBatchPollAction } from "@/components/keywords/use-rank-check-batch-poll";
import { useRankCheckBatchProgress } from "@/components/keywords/use-rank-check-batch-progress";
import type { GetRankCheckStatusesResult } from "@/lib/actions/rank-check-status";
import { type CostRateInfo, runCostCents } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { neutralRankCheckFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { runCheckNowSchema } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/constants";
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

function terminalFailure(result: GetRankCheckStatusesResult) {
  if (result.status === "deferred") {
    const presentation = neutralRankCheckFailurePresentation("rank_check_deferred");
    return {
      code: presentation.code,
      message: presentation.message,
      rankCheckId: null as string | null,
    };
  }
  return {
    code: result.errorCode,
    message: result.error ?? "The rank check failed.",
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
          message: actionErrorMessage(result.reason),
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
          message: keywordRunCheckBlockMessage(
            result.value,
            "The rank check could not be started.",
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
          message: "The rank check could not be started.",
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
          : [...previous.failures, { ...terminalFailure(result), rankCheckId: result.rankCheckId }];
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
