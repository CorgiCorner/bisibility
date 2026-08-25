// Checks v2 shared contract between the data layer (lib/queries/check-runs.ts)
// and the presentational components in components/checks/runs and
// components/checks/upcoming. Seeded identically on all checks-v2 branches;
// keep changes additive and mirror them across branches before merging.

import type { Device } from "@/lib/generated/prisma/client";

export type RankCheckStatus = "running" | "completed" | "failed" | "deferred";

export type CheckRange = "24h" | "7d" | "30d";

export type CheckRunFilter = "all" | "completed" | "failed" | "running" | "deferred" | "fallback";

export type CheckRunProviderOption = {
  label: string;
  value: string;
};

export type CheckRunTriggerFilter = "all" | "manual" | "scheduled";

export type DeferredReason = "rate_limited" | "no_provider" | "budget_exhausted" | "migration_hold";

export type CheckAttemptOutcome =
  | "ok"
  | "rate_limited"
  | "provider_failed"
  | "credentials_unavailable";

export type CheckAttempt = {
  provider: string;
  providerLabel: string;
  outcome: CheckAttemptOutcome;
  /** Human-readable detail, e.g. "provider error (500)". Null when unavailable. */
  detail: string | null;
  /** True when the attempt ran at country level because the provider lacks a city handle. */
  degradedToCountry: boolean;
  costCents: number | null;
  durationMs: number | null;
};

export type CheckRunRow = {
  id: string;
  keywordId: string;
  /** Identifier usable in /keywords/[id] links. */
  keywordPublicId: string;
  keyword: string;
  /** Persisted display name of the keyword's location. */
  location: string;
  /** Persisted language label for the keyword's location, or null when unavailable. */
  languageLabel: string | null;
  /** Whether the market/language pair has research volume and difficulty coverage. */
  researchMetricsAvailable: boolean;
  /** Device targeted by the keyword. */
  device: Device;
  status: Exclude<RankCheckStatus, "deferred">;
  position: number | null;
  previousPosition: number | null;
  error: string | null;
  provider: string;
  providerLabel: string;
  attemptCount: number;
  viaFallback: boolean;
  degradedToCountry: boolean;
  requestedDepth: number | null;
  costCents: number | null;
  estimatedCostCents: number | null;
  trigger: "scheduled" | "manual" | null;
  checkedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  attempts: CheckAttempt[];
  /** Stored search results for this run. Null for runs that did not complete. */
  storedResults: StoredResultsSummary | null;
};

/**
 * Stored search results kept from the moment of a check.
 *
 * `rank_checks.raw` holds the normalized snapshot and `rank_checks.organicRanks` the
 * compact best-position-per-domain list. The shipped raw purge nulls `raw` after the
 * retention window and leaves `organicRanks`, so a check degrades full -> compact -> none
 * without losing its position history.
 */
export type StoredResultsTier = "full" | "compact" | "none";

export type StoredResultsSummary = {
  tier: StoredResultsTier;
  requestedDepth: number | null;
  /** Highest rank present in the snapshot. Ranks are not guaranteed contiguous. */
  retrievedPositions: number | null;
  /** ISO date the full detail expires. Null when retention is unlimited or tier is not full. */
  fullDetailUntil: string | null;
  /** The crawl stopped once it matched the tracked domain. Null when the tier cannot say. */
  stoppedAtResult: boolean | null;
};

export type RetrievedRow = {
  position: number;
  domain: string;
  url: string | null;
  title: string | null;
  tracked: boolean;
};

type RetrievedResultsBase = {
  checkId: string;
  checkedAt: string;
  provider: string;
  providerLabel: string;
};

export type RetrievedResults =
  | (RetrievedResultsBase & {
      tier: "full";
      requestedDepth: number | null;
      retrievedPositions: number;
      trackedPosition: number | null;
      /** The crawl stopped once it matched the tracked domain, so the tail was never requested. */
      stoppedAtResult: boolean;
      rows: RetrievedRow[];
      features: string[];
      /** Null when the check's provider cannot report AI overviews at all. */
      aiOverview: boolean | null;
      fullDetailUntil: string | null;
    })
  | (RetrievedResultsBase & {
      tier: "compact";
      domains: Array<{ domain: string; bestPosition: number }>;
      expiredAt: string | null;
    })
  | (RetrievedResultsBase & { tier: "none" });

/** One row of the stored-checks picker on keyword detail. */
export type StoredResultsIndexEntry = StoredResultsSummary & {
  checkId: string;
  checkedAt: string;
  position: number | null;
  provider: string;
  providerLabel: string;
  /** The check ran at country level after a provider fallback. */
  degradedToCountry: boolean;
};

export type CheckRunsCounts = {
  /** Runs that executed: completed + failed + running. Excludes deferred. */
  runs: number;
  completed: number;
  failed: number;
  running: number;
  deferred: number;
  viaFallback: number;
};

export type CheckRunsCursor = { checkedAt: string; id: string } | null;

export type ProviderHealthEntry = {
  provider: string;
  providerLabel: string;
  /** True when this provider is the primary entry in the connected SERP chain. */
  isPrimary: boolean;
  /** Completed directly as the first attempted provider. */
  direct: number;
  /** Completed runs this provider served as a fallback. */
  coveredAsFallback: number;
  rateLimited: number;
  failed: number;
};

export type DeferredGroup = {
  reason: DeferredReason;
  count: number;
  keywordCount: number;
  firstAt: string;
  lastAt: string;
};

export type CheckRunsView = {
  rows: CheckRunRow[];
  counts: CheckRunsCounts;
  /** Scheduled project keywords whose latest completed check is more than 48 hours old. */
  staleCount: number;
  nextCursor: CheckRunsCursor;
  providerHealth: ProviderHealthEntry[];
  deferredGroups: DeferredGroup[];
  /** Actual cost where known, estimate otherwise, summed over the range. */
  spendCents: number;
};

export type UpcomingBlockReason = "no_provider" | "migration_hold" | "budget_exhausted";

export type UpcomingBlockedGroup = {
  reason: UpcomingBlockReason;
  /**
   * The forecast models one next scheduled occurrence per keyword, so this is
   * also the number of blocked checks represented by the group.
   */
  keywordCount: number;
};

export type UpcomingSample = {
  keywordId: string;
  keywordPublicId: string;
  keyword: string;
  nextCheckAt: string;
  frequency: string;
};

export type UpcomingDayGroup = {
  /** ISO date (project timezone). */
  key: string;
  /** "Today", "Tomorrow", or a formatted date label. */
  label: string;
  count: number;
  estimatedCostCents: number;
  samples: UpcomingSample[];
};

export type UpcomingForecast = {
  capCents: number;
  spentCents: number;
  next48hCents: number;
  /** ISO date the cap is projected to run out; null when the spend rate is zero. */
  capLastsUntil: string | null;
};

export type UpcomingView = {
  blocked: UpcomingBlockedGroup[];
  days: UpcomingDayGroup[];
  forecast: UpcomingForecast | null;
  providerSummary: string;
  timeZone: string;
};
