import type { BacklinksFailedSummary } from "@/lib/backlinks/types";
import type { ApiContext } from "./context";
import { errorResponse } from "./responses";

export function backlinksFailureResponse(ctx: ApiContext, outcome: BacklinksFailedSummary) {
  const summary = outcome.summary;
  // Project each field so internal error causes and provider payloads cannot cross this boundary.
  const details = {
    cost_cents: null,
    known_summary_cost_cents: outcome.knownSummaryCostCents,
    history_failure: { code: outcome.historyFailure.code, phase: outcome.historyFailure.phase },
    history_status: "failed",
    include_subdomains: outcome.includeSubdomains,
    ok: false,
    provider: outcome.provider,
    reason: "history_failed",
    rows_status: "not_requested",
    status: "failed",
    summary: {
      backlinks_total: summary.backlinksTotal,
      broken_backlinks: summary.brokenBacklinks,
      broken_pages: summary.brokenPages,
      dofollow_pct: summary.dofollowPct,
      domain_rank: summary.domainRank,
      lost_backlinks: summary.lostBacklinks,
      lost_referring_domains: summary.lostReferringDomains,
      new_backlinks: summary.newBacklinks,
      new_referring_domains: summary.newReferringDomains,
      referring_domains_total: summary.referringDomainsTotal,
      referring_pages: summary.referringPages,
      spam_score: summary.spamScore,
    },
    target: outcome.target,
    target_scope: outcome.targetScope,
  };
  return errorResponse(
    "internal_server_error",
    "The backlinks history request failed. Total provider cost is unknown.",
    500,
    {
      headers: ctx.headers,
      instance: ctx.instance,
      problemDetails: details,
    },
  );
}
