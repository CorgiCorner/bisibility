export type FailureBreakdownInput = {
  errorSummary: string;
  occurredAt: string;
  projectId: string;
  provider: string;
};

export type FailureBreakdownGroup = {
  count: number;
  errorSummary: string;
  firstSeen: string;
  lastSeen: string;
  projectCount: number;
  projectIds: string[];
  provider: string;
};

export type FailureBreakdown = {
  groups: FailureBreakdownGroup[];
  remainderCount: number;
};

type MutableFailureGroup = Omit<FailureBreakdownGroup, "projectCount" | "projectIds"> & {
  projects: Set<string>;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function buildFailureBreakdown(
  rows: readonly FailureBreakdownInput[],
  limit = 8,
): FailureBreakdown {
  const byProvider = new Map<string, Map<string, MutableFailureGroup>>();

  for (const row of rows) {
    let byError = byProvider.get(row.provider);
    if (!byError) {
      byError = new Map();
      byProvider.set(row.provider, byError);
    }

    const group = byError.get(row.errorSummary);
    if (group) {
      group.count += 1;
      group.projects.add(row.projectId);
      if (row.occurredAt < group.firstSeen) group.firstSeen = row.occurredAt;
      if (row.occurredAt > group.lastSeen) group.lastSeen = row.occurredAt;
      continue;
    }

    byError.set(row.errorSummary, {
      count: 1,
      errorSummary: row.errorSummary,
      firstSeen: row.occurredAt,
      lastSeen: row.occurredAt,
      projects: new Set([row.projectId]),
      provider: row.provider,
    });
  }

  const groups = [...byProvider.values()]
    .flatMap((byError) => [...byError.values()])
    .map(({ projects, ...group }): FailureBreakdownGroup => {
      const projectCount = projects.size;
      return {
        ...group,
        projectCount,
        projectIds: projectCount <= 5 ? [...projects].sort(compareText).slice(0, 3) : [],
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        compareText(left.provider, right.provider) ||
        compareText(left.errorSummary, right.errorSummary),
    );
  const cappedLimit = Math.max(0, Math.floor(limit));

  return {
    groups: groups.slice(0, cappedLimit),
    remainderCount: Math.max(0, groups.length - cappedLimit),
  };
}

export type ProviderHealthInput = {
  latestSuccessAt: string | null;
  provider: string;
  status: string;
};

export type ProviderHealthRow = {
  failed: number;
  failureRatePercent: number | null;
  notRun: number;
  ok: number;
  p95AgeMs: number | null;
  provider: string;
  stale: number;
};

type MutableProviderHealth = Omit<ProviderHealthRow, "failureRatePercent" | "p95AgeMs"> & {
  successAges: number[];
};

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

export function checkFailureRate(failed: number, succeeded: number): number | null {
  const total = failed + succeeded;
  return total === 0 ? null : (failed / total) * 100;
}

export function buildProviderHealthMatrix(
  rows: readonly ProviderHealthInput[],
  now: Date,
): ProviderHealthRow[] {
  const providers = new Map<string, MutableProviderHealth>();

  for (const row of rows) {
    let health = providers.get(row.provider);
    if (!health) {
      health = { failed: 0, notRun: 0, ok: 0, provider: row.provider, stale: 0, successAges: [] };
      providers.set(row.provider, health);
    }

    if (row.status.startsWith("succeeded_")) health.ok += 1;
    else if (row.status === "deferred_rate_limit") health.stale += 1;
    else if (row.status === "failed") health.failed += 1;
    else health.notRun += 1;

    if (row.latestSuccessAt !== null) {
      const successTime = Date.parse(row.latestSuccessAt);
      if (Number.isFinite(successTime)) {
        health.successAges.push(Math.max(0, now.getTime() - successTime));
      }
    }
  }

  return [...providers.values()]
    .map(
      ({ successAges, ...health }): ProviderHealthRow => ({
        ...health,
        failureRatePercent: checkFailureRate(health.failed, health.ok + health.stale),
        p95AgeMs: percentile95(successAges),
      }),
    )
    .sort((left, right) => compareText(left.provider, right.provider));
}

export type HealthTone = "ok" | "stale" | "failed" | "unknown";

export function healthToneForRate(rate: number | null): HealthTone {
  if (rate === null) return "unknown";
  if (rate < 5) return "ok";
  if (rate <= 20) return "stale";
  return "failed";
}
