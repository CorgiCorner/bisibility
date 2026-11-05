/** Same window as retained queued-source evidence. */
export const GOTO_HISTORY_SOURCE_WINDOW_MS = 30 * 86_400_000;

export const GOTO_HISTORY_REDIRECT_CODE = "provider_unresolved_redirects";
export const GOTO_HISTORY_ANOMALY_CODE = "organic_result_unclassifiable";

export type GotoHistoryRun = { deletedAt: Date | null; status: string };

export type GotoHistoryCandidate = {
  attempts: unknown;
  connectionId: string | null;
  connectionMatches: boolean;
  error: string | null;
  errorCode: string | null;
  finishedAt: Date | null;
  now: Date;
  operatorReviewPartial: boolean;
  providerTaskId: string | null;
  raw: unknown;
  recoveryRestoredAt: Date | null;
  retainedSource: boolean;
  run: GotoHistoryRun | null;
  status: string;
  taskCreatedAt: Date | null;
};

export type GotoHistoryClass =
  | "eligible_requalify"
  | "eligible_retained"
  | "eligible_task_get"
  | "not_eligible_account"
  | "not_eligible_completed"
  | "not_eligible_expired"
  | "not_eligible_no_source"
  | "not_eligible_not_goto"
  | "not_eligible_run";

export type GotoHistoryMarker =
  | "error_token"
  | "partial_evidence"
  | "redirect_code"
  | "stored_anomaly";

function tokens(value: string) {
  return value.split(/[^A-Za-z0-9_]+/).filter((token) => token.length > 0);
}

function hasAnomalyToken(value: unknown): boolean {
  if (typeof value === "string") return tokens(value).includes(GOTO_HISTORY_ANOMALY_CODE);
  if (!Array.isArray(value)) return false;
  return value.some(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      hasAnomalyToken((item as { message?: unknown }).message),
  );
}

function anomalyCodes(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const record = value as { anomalies?: unknown; normalization?: { anomalies?: unknown } };
  const lists = [record.anomalies, record.normalization?.anomalies];
  return lists.flatMap((list) =>
    Array.isArray(list)
      ? list.flatMap((item) => {
          const code = (item as { code?: unknown } | null)?.code;
          return typeof code === "string" ? [code] : [];
        })
      : [],
  );
}

/** Structural GoTo failure. Prose that merely says "redirect" is not a marker. */
export function gotoHistoryFailureMarker(input: {
  attempts: unknown;
  error: string | null;
  errorCode: string | null;
  operatorReviewPartial: boolean;
  raw: unknown;
}): GotoHistoryMarker | null {
  if (input.errorCode === GOTO_HISTORY_REDIRECT_CODE) return "redirect_code";
  if (anomalyCodes(input.raw).includes(GOTO_HISTORY_ANOMALY_CODE)) return "stored_anomaly";
  if (hasAnomalyToken(input.error) || hasAnomalyToken(input.attempts)) return "error_token";
  if (input.operatorReviewPartial) return "partial_evidence";
  return null;
}

function taskWithinWindow(candidate: GotoHistoryCandidate) {
  if (!candidate.providerTaskId || !candidate.taskCreatedAt) return false;
  return (
    candidate.now.getTime() - candidate.taskCreatedAt.getTime() <= GOTO_HISTORY_SOURCE_WINDOW_MS
  );
}

export function classifyGotoHistoryCandidate(candidate: GotoHistoryCandidate): GotoHistoryClass {
  if (candidate.status === "completed" || candidate.recoveryRestoredAt)
    return "not_eligible_completed";
  const run = candidate.run;
  if (!run || run.deletedAt || run.status === "cancelled" || run.status === "cancelling")
    return "not_eligible_run";
  if (!gotoHistoryFailureMarker(candidate)) return "not_eligible_not_goto";
  if (candidate.retainedSource) return "eligible_retained";
  if (candidate.operatorReviewPartial) return "eligible_requalify";
  if (candidate.providerTaskId && !candidate.connectionMatches) return "not_eligible_account";
  if (candidate.providerTaskId && !taskWithinWindow(candidate)) return "not_eligible_expired";
  if (taskWithinWindow(candidate) && candidate.connectionId) return "eligible_task_get";
  return "not_eligible_no_source";
}
