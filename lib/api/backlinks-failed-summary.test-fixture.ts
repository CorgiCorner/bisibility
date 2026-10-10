import type { ApiContext } from "./context";

export const failedSummaryFixture = {
  ok: false as const,
  status: "failed" as const,
  reason: "history_failed" as const,
  costCents: null,
  knownSummaryCostCents: 0.2,
  summary: {
    backlinksTotal: 12,
    brokenBacklinks: 0,
    brokenPages: 0,
    dofollowPct: 50,
    domainRank: 10,
    lostBacklinks: 0,
    lostReferringDomains: 0,
    newBacklinks: 0,
    newReferringDomains: 0,
    referringDomainsTotal: 2,
    referringPages: 3,
    spamScore: 0,
  },
  historyStatus: "failed" as const,
  rowsStatus: "not_requested" as const,
  historyFailure: { code: "provider_usage_unconfirmed" as const, phase: "measurement" as const },
  provider: "dataforseo",
  target: "example.com",
  targetScope: "site" as const,
  includeSubdomains: true,
};

export const expectedFailedSummaryDetails = {
  ok: false,
  status: "failed",
  reason: "history_failed",
  cost_cents: null,
  known_summary_cost_cents: 0.2,
  summary: {
    backlinks_total: 12,
    broken_backlinks: 0,
    broken_pages: 0,
    dofollow_pct: 50,
    domain_rank: 10,
    lost_backlinks: 0,
    lost_referring_domains: 0,
    new_backlinks: 0,
    new_referring_domains: 0,
    referring_domains_total: 2,
    referring_pages: 3,
    spam_score: 0,
  },
  history_status: "failed",
  rows_status: "not_requested",
  history_failure: { code: "provider_usage_unconfirmed", phase: "measurement" },
  provider: "dataforseo",
  target: "example.com",
  target_scope: "site",
  include_subdomains: true,
};

export const failedSummaryProjectId = "prj_a00000000000000000000000";

export function failedSummaryApiContext(
  request = new Request(
    `https://example.com/api/v1/projects/${failedSummaryProjectId}/backlinks?target=example.com`,
  ),
): ApiContext {
  return {
    actorId: "fixture_actor",
    auth: { project: { id: "fixture_project", publicId: failedSummaryProjectId } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:fixture:backlinks",
    method: "GET",
    origin: {
      credentialId: "fixture_key",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: ["projects", failedSummaryProjectId, "backlinks"],
    req: request,
    url: new URL(request.url),
  } as ApiContext;
}
