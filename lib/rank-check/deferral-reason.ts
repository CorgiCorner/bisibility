// These codes are part of report and export output. Changing them is a contract change.
export const DEFERRAL_REASON_CODES = [
  "budget_exhausted",
  "budget_missing",
  "credentials_unavailable",
  "credits_exhausted",
  "dispatcher_disabled",
  "keyword_archived",
  "market_inactive",
  "migration_hold",
  "no_provider",
  "primary_provider_not_dataforseo",
  "project_ineligible",
  "project_read_only",
  "queued_dataforseo_disabled",
  "queued_submission_disabled",
  "quote_unavailable",
  "rate_limited",
  "schedule_ineligible",
  "unknown",
  "usage_unconfirmed",
] as const;

export type DeferralReasonCode = (typeof DEFERRAL_REASON_CODES)[number];

const CODES = new Set<string>(DEFERRAL_REASON_CODES);

const BEFORE_PROVIDER = new Set<DeferralReasonCode>([
  "dispatcher_disabled",
  "keyword_archived",
  "market_inactive",
  "migration_hold",
  "no_provider",
  "project_ineligible",
  "project_read_only",
  "queued_dataforseo_disabled",
  "schedule_ineligible",
]);

const EXACT: Record<string, DeferralReasonCode> = {
  "DataForSEO credentials are unavailable.": "credentials_unavailable",
  "DataForSEO is no longer the effective primary SERP provider.": "primary_provider_not_dataforseo",
  "DataForSEO provider rate limit or cooldown prevented queued submission.": "rate_limited",
  "Deployment credits are exhausted.": "credits_exhausted",
  "Deployment spending budget is exhausted.": "budget_exhausted",
  "Keyword schedule no longer permits automatic work.": "schedule_ineligible",
  "Project is in read-only mode.": "project_read_only",
  ["Project spending budget is missing. " +
    "Ask the project owner to configure a monthly budget in Settings > Usage."]: "budget_missing",
  "Project state no longer permits scheduled rank checks.": "project_ineligible",
  "Provider request has no confirmed monetary estimate": "quote_unavailable",
  "Provider usage is not fully confirmed. Reconcile the retained usage evidence before retrying.":
    "usage_unconfirmed",
  "Queued DataForSEO rank checks were disabled before batch preparation.":
    "queued_dataforseo_disabled",
  "Queued DataForSEO rank checks were disabled before submission.": "queued_dataforseo_disabled",
  "Queued provider allocation reached; deferring this batch.": "budget_exhausted",
  "Rank check monthly budget reached before queued batch submission.": "budget_exhausted",
  "Rank check monthly budget reached.": "budget_exhausted",
  "The keyword was archived before the queued batch could start.": "keyword_archived",
  "The market for these keywords is no longer active.": "market_inactive",
  "This operation is unavailable for this project.": "project_ineligible",
};

const SUBMISSION_DISABLED =
  /^Queued provider submission is disabled in [a-z0-9_-]+ scheduler mode\.$/;
const OWN_KEY_PREFIX = "This account runs paid provider work only on its own provider keys.";

export function deferralReasonCode(stored: string | null | undefined): DeferralReasonCode {
  const value = stored?.trim() ?? "";
  if (!value) return "unknown";
  if (CODES.has(value)) return value as DeferralReasonCode;
  if (/^budget_exhausted:/i.test(value)) return "budget_exhausted";
  const exact = EXACT[value];
  if (exact) return exact;
  if (SUBMISSION_DISABLED.test(value)) return "queued_submission_disabled";
  if (value.startsWith(OWN_KEY_PREFIX)) return "credentials_unavailable";
  if (value.toLowerCase().includes("rate limit")) return "rate_limited";
  return "unknown";
}

/** Stable code for a known deferral. Unrecognized text, including budget surface suffixes, stays. */
export function storedDeferralReason(detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) return detail;
  if (/^budget_exhausted:[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
  const code = deferralReasonCode(trimmed);
  return code === "unknown" ? trimmed : code;
}

export function deferredBeforeProviderChoice(code: DeferralReasonCode): boolean {
  return BEFORE_PROVIDER.has(code);
}
