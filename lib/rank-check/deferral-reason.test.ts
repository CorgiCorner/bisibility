import { describe, expect, it } from "vitest";
import {
  DEFERRAL_REASON_CODES,
  deferralReasonCode,
  deferredBeforeProviderChoice,
  storedDeferralReason,
} from "./deferral-reason";

const STORED: Array<[string, ReturnType<typeof deferralReasonCode>]> = [
  ["queued_dataforseo_disabled", "queued_dataforseo_disabled"],
  [
    "Queued DataForSEO rank checks were disabled before batch preparation.",
    "queued_dataforseo_disabled",
  ],
  ["Queued DataForSEO rank checks were disabled before submission.", "queued_dataforseo_disabled"],
  ["dispatcher_disabled", "dispatcher_disabled"],
  [
    "Queued provider submission is disabled in cutover scheduler mode.",
    "queued_submission_disabled",
  ],
  ["project_ineligible", "project_ineligible"],
  ["Project state no longer permits scheduled rank checks.", "project_ineligible"],
  ["This operation is unavailable for this project.", "project_ineligible"],
  ["credentials_unavailable", "credentials_unavailable"],
  ["DataForSEO credentials are unavailable.", "credentials_unavailable"],
  [
    "This account runs paid provider work only on its own provider keys. " +
      "Connect your own Example key.",
    "credentials_unavailable",
  ],
  ["primary_provider_not_dataforseo", "primary_provider_not_dataforseo"],
  [
    "DataForSEO is no longer the effective primary SERP provider.",
    "primary_provider_not_dataforseo",
  ],
  ["schedule_ineligible", "schedule_ineligible"],
  ["Keyword schedule no longer permits automatic work.", "schedule_ineligible"],
  ["keyword_archived", "keyword_archived"],
  ["The keyword was archived before the queued batch could start.", "keyword_archived"],
  ["market_inactive", "market_inactive"],
  ["The market for these keywords is no longer active.", "market_inactive"],
  ["quote_unavailable", "quote_unavailable"],
  ["Provider request has no confirmed monetary estimate", "quote_unavailable"],
  ["budget_exhausted", "budget_exhausted"],
  ["budget_exhausted:programmatic", "budget_exhausted"],
  ["Rank check monthly budget reached before queued batch submission.", "budget_exhausted"],
  ["Rank check monthly budget reached.", "budget_exhausted"],
  ["Queued provider allocation reached; deferring this batch.", "budget_exhausted"],
  ["Deployment spending budget is exhausted.", "budget_exhausted"],
  ["budget_missing", "budget_missing"],
  [
    "Project spending budget is missing. Ask the project owner to configure a monthly budget in Settings > Usage.",
    "budget_missing",
  ],
  ["usage_unconfirmed", "usage_unconfirmed"],
  [
    "Provider usage is not fully confirmed. Reconcile the retained usage evidence before retrying.",
    "usage_unconfirmed",
  ],
  ["rate_limited", "rate_limited"],
  ["rate limited", "rate_limited"],
  ["Provider serpapi is rate limited; deferring.", "rate_limited"],
  ["DataForSEO provider rate limit or cooldown prevented queued submission.", "rate_limited"],
  ["project_read_only", "project_read_only"],
  ["Project is in read-only mode.", "project_read_only"],
  ["credits_exhausted", "credits_exhausted"],
  ["Deployment credits are exhausted.", "credits_exhausted"],
  ["no_provider", "no_provider"],
  ["migration_hold", "migration_hold"],
  ["deadline", "unknown"],
  ["late retry", "unknown"],
  ["not a budget problem", "unknown"],
];

describe("deferralReasonCode", () => {
  it.each(DEFERRAL_REASON_CODES)("keeps the stored code %s", (code) => {
    expect(deferralReasonCode(code)).toBe(code);
  });

  it.each(STORED)("maps %j to %s", (stored, code) => {
    expect(deferralReasonCode(stored)).toBe(code);
  });

  it("maps blank values to unknown", () => {
    expect(deferralReasonCode(null)).toBe("unknown");
    expect(deferralReasonCode(undefined)).toBe("unknown");
    expect(deferralReasonCode("  ")).toBe("unknown");
  });
});

describe("storedDeferralReason", () => {
  it("stores a code for a known sentence and keeps unrecognized text", () => {
    expect(
      storedDeferralReason("Queued DataForSEO rank checks were disabled before batch preparation."),
    ).toBe("queued_dataforseo_disabled");
    expect(storedDeferralReason("rate limited")).toBe("rate_limited");
    expect(storedDeferralReason("deadline")).toBe("deadline");
    expect(storedDeferralReason("late retry")).toBe("late retry");
    expect(storedDeferralReason("budget_exhausted:programmatic")).toBe(
      "budget_exhausted:programmatic",
    );
  });
});

describe("deferredBeforeProviderChoice", () => {
  it("marks deferrals that happen before a provider is chosen", () => {
    expect(deferredBeforeProviderChoice("queued_dataforseo_disabled")).toBe(true);
    expect(deferredBeforeProviderChoice("quote_unavailable")).toBe(false);
    expect(deferredBeforeProviderChoice("credentials_unavailable")).toBe(false);
    expect(deferredBeforeProviderChoice("unknown")).toBe(false);
  });
});
