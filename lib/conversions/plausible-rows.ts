import { pagePathForProject, pagePathHash } from "@/lib/pages/page-path";
import type { PlausibleGoalEvent } from "@/lib/providers/analytics/plausible-goals";
import { utcDay } from "./dates";

const COUNT_LIMIT = 2_147_483_647;

export type PlausibleDailyAggregate = {
  count: number;
  currency: string | null;
  date: Date;
  name: string;
  path: string;
  pathHash: string;
  revenueMinor: bigint | null;
};

export function plausibleDailyWrite(input: {
  count: number;
  createdAt: Date;
  currency: string | null;
  date: Date;
  name: string;
  path: string;
  pathHash: string;
  projectId: string;
  revenueMinor: bigint | null;
  updatedAt: Date;
}) {
  return {
    count: input.count,
    createdAt: input.createdAt,
    currency: input.currency,
    date: utcDay(input.date),
    name: input.name,
    path: input.path,
    pathHash: input.pathHash,
    projectId: input.projectId,
    revenueMinor: input.revenueMinor,
    source: "plausible" as const,
    updatedAt: input.updatedAt,
  };
}

export function plausibleGoalCreate(input: {
  createdAt: Date;
  firstSeen: Date;
  lastSeen: Date;
  projectId: string;
  sourceName: string;
  updatedAt: Date;
}) {
  return {
    countsRevenue: false,
    createdAt: input.createdAt,
    displayName: input.sourceName,
    enabled: true,
    firstSeen: utcDay(input.firstSeen),
    lastSeen: utcDay(input.lastSeen),
    projectId: input.projectId,
    source: "plausible" as const,
    sourceName: input.sourceName,
    updatedAt: input.updatedAt,
  };
}

function aggregateKey(date: Date, pathHash: string, name: string) {
  return `${date.getTime()}:${pathHash}:${name}`;
}

function addRevenue(
  current: { currency: string | null; revenueMinor: bigint | null },
  next: PlausibleGoalEvent["revenue"],
) {
  if (!next) return current;
  if (current.revenueMinor == null || current.currency == null) {
    return { currency: next.currency, revenueMinor: next.minor };
  }
  if (current.currency !== next.currency) return { currency: null, revenueMinor: null };
  return { currency: current.currency, revenueMinor: current.revenueMinor + next.minor };
}

/** Daily per-page, per-goal counts. Off-site and empty paths are dropped. No visitor ids are kept. */
export function aggregatePlausibleGoals(domain: string, rows: readonly PlausibleGoalEvent[]) {
  const grouped = new Map<string, PlausibleDailyAggregate>();
  for (const row of rows) {
    if (row.events <= 0) continue;
    const path = pagePathForProject(domain, row.entryPage);
    if (!path) continue;
    const date = utcDay(new Date(`${row.date}T00:00:00.000Z`));
    const pathHash = pagePathHash(path);
    const key = aggregateKey(date, pathHash, row.goal);
    const current = grouped.get(key);
    const count = Math.min(COUNT_LIMIT, (current?.count ?? 0) + row.events);
    const revenue = addRevenue(
      {
        currency: current?.currency ?? null,
        revenueMinor: current?.revenueMinor ?? null,
      },
      row.revenue,
    );
    grouped.set(key, {
      count,
      currency: revenue.currency,
      date,
      name: row.goal,
      path,
      pathHash,
      revenueMinor: revenue.revenueMinor,
    });
  }
  return [...grouped.values()];
}
