export type IndexingBudgetMode = "off" | "fixed" | "available_quota";

export type IndexingSourceCounts = {
  keyword_target: number;
  manual: number;
  sitemap: number;
};

export type IndexingProgressInput = {
  checked: number;
  dailyLimit: number;
  estimatedDaysRemaining: number | null;
  mode: IndexingBudgetMode;
  nextBatchAt: string | null;
  total: number;
};

export type IndexingProgress =
  | { kind: "available_quota"; checked: number; percent: number; total: number }
  | {
      kind: "fixed";
      checked: number;
      dailyLimit: number;
      daysLeft: number | null;
      nextBatchAt: string | null;
      percent: number;
      total: number;
    }
  | { kind: "limit_zero" }
  | { kind: "off" };

function percent(checked: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((checked / total) * 100));
}

/** Presentation of the progress card. Limit 0 and Off do not pretend a check ran. */
export function indexingProgress(input: IndexingProgressInput): IndexingProgress {
  if (input.mode === "off") return { kind: "off" };
  if (input.mode === "fixed" && input.dailyLimit <= 0) return { kind: "limit_zero" };
  if (input.mode === "available_quota") {
    return {
      kind: "available_quota",
      checked: input.checked,
      percent: percent(input.checked, input.total),
      total: input.total,
    };
  }
  const daysLeft =
    input.dailyLimit > 0 &&
    input.estimatedDaysRemaining != null &&
    input.estimatedDaysRemaining >= 0
      ? input.estimatedDaysRemaining
      : null;
  return {
    kind: "fixed",
    checked: input.checked,
    dailyLimit: input.dailyLimit,
    daysLeft,
    nextBatchAt: input.nextBatchAt,
    percent: percent(input.checked, input.total),
    total: input.total,
  };
}

/**
 * `inspection-retry.ts` retries a rate limit inside one run. It does not schedule
 * the next day. `orderInspectionCandidates` skips a URL that failed during the
 * current Pacific day, so the next enabled daily selection can include it.
 */
export function inspectionFailuresRetryNextDay(mode: IndexingBudgetMode, dailyLimit: number) {
  if (mode === "available_quota") return true;
  return mode === "fixed" && dailyLimit > 0;
}

export function indexedShare(indexed: number, checked: number) {
  if (checked <= 0 || indexed < 0) return null;
  return indexed / checked;
}
