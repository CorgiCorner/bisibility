import { eachUtcDay, utcDayKey } from "./dates";
import type {
  ComparisonCell,
  ComparisonRow,
  ConversionGoalTotal,
  ConversionPageTotal,
  ConversionSeriesPoint,
  ConversionSource,
  ConversionSourceTotal,
} from "./types";

export type ConversionGoalRef = {
  countsRevenue: boolean;
  displayName: string;
  enabled: boolean;
  source: ConversionSource;
  sourceName: string;
};

export type ConversionFact = {
  count: number;
  currency: string | null;
  date: Date;
  name: string;
  path: string;
  revenueMinor: bigint | null;
  source: ConversionSource;
};

type Bucket = {
  count: number;
  countsRevenue: boolean;
  currencies: Set<string>;
  revenue: bigint;
};

function bucketFor(goal: ConversionGoalRef, grouped: Map<string, Bucket>) {
  const current = grouped.get(goal.displayName) ?? {
    count: 0,
    countsRevenue: false,
    currencies: new Set<string>(),
    revenue: 0n,
  };
  current.countsRevenue = current.countsRevenue || goal.countsRevenue;
  grouped.set(goal.displayName, current);
  return current;
}

export function summarizeGoals(
  goals: readonly ConversionGoalRef[],
  rows: readonly ConversionFact[],
): ConversionGoalTotal[] {
  const grouped = new Map<string, Bucket>();
  for (const goal of goals) {
    if (!goal.enabled) continue;
    const current = bucketFor(goal, grouped);
    for (const row of rows) {
      if (row.source !== goal.source || row.name !== goal.sourceName) continue;
      current.count += row.count;
      if (!goal.countsRevenue || row.revenueMinor == null || !row.currency) continue;
      current.revenue += row.revenueMinor;
      current.currencies.add(row.currency);
    }
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([displayName, value]) => {
      const currency = value.currencies.size === 1 ? ([...value.currencies][0] ?? null) : null;
      return {
        count: value.count,
        currency: value.countsRevenue ? currency : null,
        displayName,
        revenueMinor: value.countsRevenue && currency ? value.revenue.toString() : null,
      };
    });
}

export function summarizeBySource(
  goals: readonly ConversionGoalRef[],
  rows: readonly ConversionFact[],
): ConversionSourceTotal[] {
  const sources = [...new Set(goals.filter((goal) => goal.enabled).map((goal) => goal.source))];
  return sources.map((source) => {
    const summarized = summarizeGoals(
      goals.filter((goal) => goal.source === source),
      rows.filter((row) => row.source === source),
    );
    return {
      goals: summarized,
      source,
      totalCount: summarized.reduce((sum, goal) => sum + goal.count, 0),
    };
  });
}

export function summarizePages(
  goals: readonly ConversionGoalRef[],
  rows: readonly ConversionFact[],
): ConversionPageTotal[] {
  const paths = [...new Set(rows.map((row) => row.path))].sort((left, right) =>
    left.localeCompare(right),
  );
  return paths.flatMap((path) => {
    const summarized = summarizeGoals(
      goals,
      rows.filter((row) => row.path === path),
    );
    const totalCount = summarized.reduce((sum, goal) => sum + goal.count, 0);
    return totalCount > 0 ? [{ goals: summarized, path, totalCount }] : [];
  });
}

export function summarizeSeries(
  from: Date,
  to: Date,
  goals: readonly ConversionGoalRef[],
  rows: readonly ConversionFact[],
): ConversionSeriesPoint[] {
  return eachUtcDay(from, to).map((date) => {
    const key = utcDayKey(date);
    const summarized = summarizeGoals(
      goals,
      rows.filter((row) => utcDayKey(row.date) === key),
    );
    return {
      date: key,
      goals: summarized,
      totalCount: summarized.reduce((sum, goal) => sum + goal.count, 0),
    };
  });
}

export function comparisonRows(
  totals: readonly ConversionSourceTotal[],
  connected: readonly ConversionSource[],
): ComparisonRow[] {
  const names = new Set<string>();
  for (const source of connected) {
    for (const goal of totals.find((item) => item.source === source)?.goals ?? []) {
      names.add(goal.displayName);
    }
  }
  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((displayName) => ({
      cells: connected.map((source) => {
        const goal = totals
          .find((item) => item.source === source)
          ?.goals.find((item) => item.displayName === displayName);
        const cell: ComparisonCell = {
          count: goal ? goal.count : null,
          currency: goal?.currency ?? null,
          revenueMinor: goal?.revenueMinor ?? null,
          source,
        };
        return cell;
      }),
      displayName,
    }));
}
