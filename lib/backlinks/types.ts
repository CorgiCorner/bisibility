import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { BacklinkFlag, BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";

export type BacklinksServiceContext = {
  actorId?: string | null;
  origin: ProviderRequestOrigin;
  projectId: string;
};

export type AnalyzeBacklinksOptions = {
  estimateOnly?: boolean;
  fresh?: boolean;
  includeSubdomains?: boolean;
  maxCostCents?: number;
  mode?: BacklinkRowMode;
  resultLimit?: 100 | 300 | 500 | 1000;
  target: string;
  targetScope?: BacklinkTargetScope;
};

export type LoadMoreBacklinkRowsOptions = {
  includeSubdomains: boolean;
  limit: number;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinksSummary = {
  backlinksTotal: number;
  brokenBacklinks: number;
  brokenPages: number;
  dofollowPct: number;
  domainRank: number;
  lostBacklinks: number;
  lostReferringDomains: number;
  newBacklinks: number;
  newReferringDomains: number;
  referringDomainsTotal: number;
  referringPages: number;
  spamScore: number;
};

export type BacklinksHistoryMonth = {
  lostLinks: number;
  lostReferringDomains: number;
  month: string;
  newLinks: number;
  newReferringDomains: number;
};

export type BacklinksRow = {
  anchor: string;
  domainAuthority: number;
  firstSeen: string | null;
  flags: BacklinkFlag[];
  linksCount: number;
  lostAt: string | null;
  sourceDomain: string;
  sourceUrl: string;
  spamScore: number;
  status: "active" | "new" | "lost";
  targetUrl: string;
};

export type BacklinksSnapshot = {
  cached: boolean;
  cachedUntil: string;
  costCents: number;
  fetchedAt: string;
  fetchedRowCount: number;
  history: BacklinksHistoryMonth[];
  includeSubdomains: boolean;
  ok: true;
  provider: string;
  rows: BacklinksRow[];
  summary: BacklinksSummary;
  target: string;
  targetScope: BacklinkTargetScope;
  totalRowsAvailable: number;
};

/**
 * A free dry run. It carries only the cost facts, never report fields, so a caller cannot
 * mistake it for an empty backlink profile.
 */
export type BacklinksEstimate = {
  cached: boolean;
  /** Expiry of the unexpired snapshot the paid call would reuse; null without one. */
  cachedUntil: string | null;
  costCents: number;
  estimate: true;
  estimatedCostCents: number;
  includeSubdomains: boolean;
  ok: true;
  provider: string;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinksOutcome = BacklinksSnapshot | BacklinksEstimate | ProviderLookupFailure;

export function isBacklinksEstimate(
  outcome: BacklinksEstimate | BacklinksSnapshot,
): outcome is BacklinksEstimate {
  return "estimate" in outcome && outcome.estimate === true;
}
/** Loading more rows always extends a stored snapshot; it never produces a dry run. */
export type BacklinksRowsOutcome = BacklinksSnapshot | ProviderLookupFailure;
