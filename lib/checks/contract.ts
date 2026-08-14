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
