import { completedCheckAttempts, parseCheckAttempts, providerLabel } from "./attempts";
import type {
  CheckRange,
  CheckRunFilter,
  CheckRunRow,
  CheckRunsCursor,
  CheckRunsView,
  ProviderHealthEntry,
} from "./contract";
import { RANK_CHECK_STATUS } from "./status";

const RANGE_DAYS = { "24h": 1, "7d": 7, "30d": 30 } satisfies Record<CheckRange, number>;

export type CheckRunsViewOptions = {
  cursor?: Exclude<CheckRunsCursor, null>;
  limit?: number;
  now?: Date;
  provider?: string;
  range?: CheckRange;
  status?: CheckRunFilter;
  trigger?: "all" | "manual" | "scheduled";
};

export type CheckRunSource = {
  attemptCount: number;
  attempts: unknown;
  checkedAt: Date;
  costCents: unknown;
  degradedToCountry: boolean;
  error: string | null;
  estimatedCostCents: unknown;
  finishedAt: Date | null;
  publicId: string | null;
  keyword: { publicId: string; text: string };
  position: number | null;
  previousPosition: number | null;
  provider: string;
  requestedDepth: number | null;
  startedAt: Date | null;
  status: string;
  trigger: string | null;
  viaFallback: boolean;
};

export type CheckRunsSummary = Pick<
  CheckRunsView,
  "counts" | "deferredGroups" | "providerHealth" | "spendCents"
>;

export type ProviderCompletionGroup = {
  _count: { _all: number };
  provider: string;
  viaFallback: boolean;
};

export type ProviderAttemptSource = {
  attempts: unknown;
  provider: string;
  status: string;
};

export type ProviderChainEntry = {
  provider: string;
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validTrigger(value: string | null): "manual" | "scheduled" | null {
  return value === "manual" || value === "scheduled" ? value : null;
}

function durationMs(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt || !finishedAt) return null;
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

export function checkRangeStart(range: CheckRange, now: Date) {
  return new Date(now.getTime() - RANGE_DAYS[range] * 86_400_000);
}

export function checkRunsPageLimit(value: number | undefined) {
  return Math.min(Math.max(Math.trunc(value ?? 20), 1), 50);
}

function rowFor(source: CheckRunSource): CheckRunRow | null {
  if (
    source.status !== RANK_CHECK_STATUS.COMPLETED &&
    source.status !== RANK_CHECK_STATUS.FAILED &&
    source.status !== RANK_CHECK_STATUS.RUNNING
  ) {
    return null;
  }
  if (!source.publicId) throw new Error("Rank check public ID is not available.");

  const attempts =
    source.status === RANK_CHECK_STATUS.COMPLETED
      ? completedCheckAttempts(source.attempts, source.provider)
      : parseCheckAttempts(source.attempts);

  return {
    attemptCount: source.attemptCount,
    attempts,
    checkedAt: source.checkedAt.toISOString(),
    costCents: finiteNumber(source.costCents),
    degradedToCountry: source.degradedToCountry,
    durationMs: durationMs(source.startedAt, source.finishedAt),
    error: source.error,
    estimatedCostCents: finiteNumber(source.estimatedCostCents),
    finishedAt: source.finishedAt?.toISOString() ?? null,
    id: source.publicId,
    keyword: source.keyword.text,
    keywordId: source.keyword.publicId,
    keywordPublicId: source.keyword.publicId,
    position: source.position,
    previousPosition: source.previousPosition,
    provider: source.provider,
    providerLabel: providerLabel(source.provider),
    requestedDepth: source.requestedDepth,
    startedAt: source.startedAt?.toISOString() ?? null,
    status: source.status,
    trigger: validTrigger(source.trigger),
    viaFallback: source.viaFallback,
  };
}

export function buildProviderHealth(
  completionGroups: readonly ProviderCompletionGroup[],
  attemptRows: readonly ProviderAttemptSource[],
  providerChain: readonly ProviderChainEntry[],
): ProviderHealthEntry[] {
  const entries = new Map<string, ProviderHealthEntry>();
  const primaryProvider = providerChain[0]?.provider ?? null;
  const entryFor = (provider: string) => {
    const existing = entries.get(provider);
    if (existing) return existing;
    const created = {
      coveredAsFallback: 0,
      direct: 0,
      failed: 0,
      isPrimary: provider === primaryProvider,
      provider,
      providerLabel: providerLabel(provider),
      rateLimited: 0,
    };
    entries.set(provider, created);
    return created;
  };

  for (const group of completionGroups) {
    const entry = entryFor(group.provider);
    if (group.viaFallback) entry.coveredAsFallback += group._count._all;
    else entry.direct += group._count._all;
  }

  for (const row of attemptRows) {
    const attempts = parseCheckAttempts(row.attempts);
    for (const attempt of attempts) {
      const entry = entryFor(attempt.provider);
      if (attempt.outcome === "rate_limited") entry.rateLimited += 1;
      else if (attempt.outcome !== "ok") entry.failed += 1;
    }
    if (row.status === RANK_CHECK_STATUS.FAILED && attempts.length === 0) {
      entryFor(row.provider).failed += 1;
    }
  }

  // Primary provider leads; the rest fall back to completion volume, then label.
  return [...entries.values()].sort(
    (left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary) ||
      right.direct + right.coveredAsFallback - left.direct - left.coveredAsFallback ||
      left.providerLabel.localeCompare(right.providerLabel),
  );
}

export function buildCheckRunsView(
  pageRows: readonly CheckRunSource[],
  summary: CheckRunsSummary,
  options: Pick<CheckRunsViewOptions, "limit"> = {},
): CheckRunsView {
  const requestedLimit = checkRunsPageLimit(options.limit);
  const mappedRows = pageRows.flatMap((source) => {
    const row = rowFor(source);
    return row ? [row] : [];
  });
  const rows = mappedRows.slice(0, requestedLimit);
  const last = rows.at(-1);

  return {
    ...summary,
    nextCursor:
      mappedRows.length > requestedLimit && last
        ? { checkedAt: last.checkedAt, id: last.id }
        : null,
    rows,
  };
}
