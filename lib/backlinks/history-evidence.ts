import { ProviderCallError } from "@/lib/providers/call-error";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { BacklinksHistoryFailure, BacklinksSummary } from "./types";
/** Server-only error: its cause is never projected into the failed evidence DTO. */
export class BacklinksHistoryEvidenceError extends Error {
  readonly historyFailure: BacklinksHistoryFailure;
  readonly summary: BacklinksSummary;

  constructor(
    error: unknown,
    summary: BacklinksSummary,
    readonly knownSummaryCostCents: number,
  ) {
    super("Backlinks history failed; summary evidence is available.", { cause: error });
    this.name = "BacklinksHistoryEvidenceError";
    const phases: readonly string[] = [
      "admission",
      "request",
      "response_body",
      "measurement",
      "settlement",
      "unknown",
    ];
    this.historyFailure =
      error instanceof ProviderUsagePersistenceError
        ? {
            code: "provider_usage_unconfirmed",
            phase: phases.includes(error.phase) ? error.phase : "unknown",
          }
        : {
            code: error instanceof ProviderCallError ? "provider_transient" : "unexpected_error",
            phase: null,
          };
    this.summary = {
      backlinksTotal: summary.backlinksTotal,
      brokenBacklinks: summary.brokenBacklinks,
      brokenPages: summary.brokenPages,
      dofollowPct: summary.dofollowPct,
      domainRank: summary.domainRank,
      lostBacklinks: summary.lostBacklinks,
      lostReferringDomains: summary.lostReferringDomains,
      newBacklinks: summary.newBacklinks,
      newReferringDomains: summary.newReferringDomains,
      referringDomainsTotal: summary.referringDomainsTotal,
      referringPages: summary.referringPages,
      spamScore: summary.spamScore,
    };
  }
}
