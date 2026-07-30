"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import type { KeywordDetailActions } from "@/components/keywords/action-utils";
import { type CostRateInfo, runCostCents } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { runCheckNowSchema } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import { useState } from "react";
import { effectiveRowDepth } from "./run-check-depth";

type RunChecksStatus = { failed: number; started: number; state: "done" | "idle" | "running" };

function checkLabel(count: number) {
  return `${count} rank check${count === 1 ? "" : "s"}`;
}

function statusLabel(status: RunChecksStatus) {
  if (status.state === "running") {
    return `Starting ${checkLabel(status.started)}...`;
  }
  if (status.state === "done" && status.failed > 0) {
    return `Started ${checkLabel(status.started)}. ${checkLabel(status.failed)} failed to start.`;
  }
  if (status.state === "done") {
    return `Started ${checkLabel(status.started)}.`;
  }
  return null;
}

export function useKeywordRunChecks(
  runCheckNowAction?: KeywordDetailActions["runCheckNowAction"],
  onSettled?: () => void,
  spendOptions: {
    providerRate?: CostRateInfo;
    rows?: Pick<KeywordRow, "id" | "projectSerpDepth" | "schedule">[];
  } = {},
) {
  const { addSpend } = useSessionSpend();
  const [checkFailed, setCheckFailed] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState<RunChecksStatus>({ failed: 0, started: 0, state: "idle" });
  const running = pendingIds.size > 0;

  async function runChecks(keywordIds: string[], depth?: SerpDepth) {
    if (!runCheckNowAction || keywordIds.length === 0) return;
    const ids = keywordIds.filter((keywordId) => !pendingIds.has(keywordId));
    if (ids.length === 0) return;
    setCheckFailed(false);
    setPendingIds((previous) => new Set([...previous, ...ids]));
    setStatus({ failed: 0, started: ids.length, state: "running" });
    const results = await Promise.allSettled(
      ids.map((keywordId) =>
        runCheckNowAction(runCheckNowSchema.parse(depth ? { depth, keywordId } : { keywordId })),
      ),
    );
    const failed = results.filter(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && isBudgetExhaustedResult(result.value)),
    ).length;
    const rowById = new Map((spendOptions.rows ?? []).map((row) => [row.id, row]));
    const successfulDepths = results.flatMap((result, index) => {
      if (result.status === "rejected" || isBudgetExhaustedResult(result.value)) return [];
      const row = rowById.get(ids[index] ?? "");
      return [depth ?? (row ? effectiveRowDepth(row) : DEFAULT_SERP_DEPTH)];
    });
    const spend = spendOptions.providerRate
      ? runCostCents(successfulDepths, spendOptions.providerRate)
      : null;
    if (spend != null) addSpend(spend);
    setCheckFailed((previous) => previous || failed > 0);
    setStatus({ failed, started: ids.length - failed, state: "done" });
    setPendingIds((previous) => {
      const next = new Set(previous);
      for (const keywordId of ids) next.delete(keywordId);
      return next;
    });
    onSettled?.();
  }

  return {
    checkFailed,
    dismissFailure: () => setCheckFailed(false),
    pendingIds,
    runChecks,
    running,
    statusLabel: statusLabel(status),
  };
}
