import type { StatusChipTone } from "@/components/ui/StatusChip";
import type { LaunchRankCheckRunActionResult } from "@/lib/actions/rank-check-run-launch-result";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";

export type PreflightScope = {
  description: string;
  equation: string;
  startLabel: string;
  subtitle: string;
  title: string;
};

export type PreflightProvider = {
  id: string;
  label: string;
  note?: string;
  tooltip: string;
};

export type PreflightBlockCode = NonNullable<RankCheckRunPreview["budget"]["reason"]>;

export type PreflightBlockTone = StatusChipTone;

export function blockCodeFor(preview: RankCheckRunPreview, actionBlock: PreflightBlockCode | null) {
  return actionBlock ?? (preview.budget.blocked ? preview.budget.reason : null);
}

export function decisionLine(
  preview: RankCheckRunPreview,
  budgetBlocked: string,
  leftAfterLabel?: string,
) {
  if (
    preview.budget.reason === "budget_exhausted" ||
    preview.budget.reason === "budget_missing" ||
    preview.budget.reason === "usage_reconciliation_required"
  )
    return budgetBlocked;
  const duration =
    preview.targetCount <= 30 ? "~40s" : preview.targetCount <= 400 ? "~6 min" : "~9 min";
  return leftAfterLabel ?? duration;
}

export function idempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `preflight-${Date.now()}`;
}

export function isNotStarted(
  result: LaunchRankCheckRunActionResult,
): result is Extract<LaunchRankCheckRunActionResult, { status: "not_started" }> {
  return "status" in result && result.status === "not_started";
}

export type LaunchFailureNotice =
  | { kind: "resign"; mismatch: boolean }
  | { kind: "payment" }
  | { kind: "block"; code: PreflightBlockCode }
  | { kind: "sample" }
  | { kind: "message" };

function isPolicyBlock(code: string): code is PreflightBlockCode {
  return (
    code === "measurement_policy_unconfigured" ||
    code === "measurement_policy_unsupported" ||
    code === "no_provider" ||
    code === "budget_exhausted" ||
    code === "budget_missing" ||
    code === "usage_reconciliation_required"
  );
}

export function launchFailureNotice(
  code: Extract<LaunchRankCheckRunActionResult, { status: "not_started" }>["code"],
  resignedMismatch: boolean,
): LaunchFailureNotice {
  if (code === "preview_mismatch" && resignedMismatch) return { kind: "message" };
  if (code === "preview_expired" || code === "preview_mismatch") {
    return { kind: "resign", mismatch: code === "preview_mismatch" };
  }
  if (code === "payment_unavailable") return { kind: "payment" };
  if (code === "sample_project") return { kind: "sample" };
  if (isPolicyBlock(code)) return { kind: "block", code };
  return { kind: "message" };
}
