import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { trailingPeriod, utcDay, utcDayKey } from "./dates";
import { conversionCatalogSources, conversionSourceLabel } from "./sources";
import {
  type ConversionFact,
  type ConversionGoalRef,
  comparisonRows,
  summarizeBySource,
  summarizePages,
  summarizeSeries,
} from "./summarize";
import {
  type ConversionPeriod,
  type ConversionSource,
  type ConversionsSettingsModel,
  conversionSourceReportsRevenue,
  isConversionSource,
} from "./types";

function bounds(period: ConversionPeriod) {
  return { from: utcDay(period.from), to: utcDay(period.to) };
}

function enabledPairs(goals: readonly ConversionGoalRef[]) {
  return goals
    .filter((goal) => goal.enabled)
    .map((goal) => ({ name: goal.sourceName, source: goal.source }));
}

async function loadGoals(
  projectId: string,
  source?: ConversionSource,
): Promise<ConversionGoalRef[]> {
  const rows = await prisma.conversionGoal.findMany({
    select: {
      countsRevenue: true,
      displayName: true,
      enabled: true,
      source: true,
      sourceName: true,
    },
    where: { projectId, ...(source ? { source } : {}) },
  });
  return rows.flatMap((row) => (isConversionSource(row.source) ? [row] : []));
}

async function loadFacts(
  projectId: string,
  from: Date,
  to: Date,
  goals: readonly ConversionGoalRef[],
): Promise<ConversionFact[]> {
  const pairs = enabledPairs(goals);
  if (pairs.length === 0 || from.getTime() > to.getTime()) return [];
  const rows = await prisma.conversionDaily.findMany({
    select: {
      count: true,
      currency: true,
      date: true,
      name: true,
      path: true,
      revenueMinor: true,
      source: true,
    },
    where: { date: { gte: from, lte: to }, OR: pairs, projectId },
  });
  return rows.flatMap((row) => (isConversionSource(row.source) ? [row] : []));
}

async function loadRevenueKeys(projectId: string) {
  const rows = await prisma.conversionDaily.findMany({
    distinct: ["source", "name"],
    select: { name: true, source: true },
    where: { projectId, revenueMinor: { not: null } },
  });
  return new Set(
    rows.flatMap((row) => (isConversionSource(row.source) ? [`${row.source}:${row.name}`] : [])),
  );
}

function sourceReportsRevenue(source: ConversionSource, revenueKeys: ReadonlySet<string>) {
  if (!conversionSourceReportsRevenue(source)) return false;
  for (const key of revenueKeys) {
    if (key.startsWith(`${source}:`)) return true;
  }
  return false;
}

async function storedPrimary(projectId: string): Promise<ConversionSource | null> {
  const row = await prisma.projectDefaults.findUnique({
    select: { primaryConversionSource: true },
    where: { projectId },
  });
  return isConversionSource(row?.primaryConversionSource) ? row.primaryConversionSource : null;
}

function sortSources<T extends { source: ConversionSource }>(rows: readonly T[]) {
  const order = new Map(conversionCatalogSources().map((entry, index) => [entry.source, index]));
  return [...rows].sort(
    (left, right) => (order.get(left.source) ?? 0) - (order.get(right.source) ?? 0),
  );
}

export async function getConversionTotals(projectId: string, period: ConversionPeriod) {
  const { from, to } = bounds(period);
  const goals = await loadGoals(projectId);
  return sortSources(summarizeBySource(goals, await loadFacts(projectId, from, to, goals)));
}

export async function getConversionPageTotals(
  projectId: string,
  period: ConversionPeriod,
  source?: ConversionSource,
) {
  const selected = source ?? (await storedPrimary(projectId));
  if (!selected) return { pages: [], source: null as ConversionSource | null };
  const { from, to } = bounds(period);
  const goals = await loadGoals(projectId, selected);
  return {
    pages: summarizePages(goals, await loadFacts(projectId, from, to, goals)),
    source: selected,
  };
}

export async function getConversionSeries(
  projectId: string,
  period: ConversionPeriod,
  source?: ConversionSource,
) {
  const selected = source ?? (await storedPrimary(projectId));
  const { from, to } = bounds(period);
  if (!selected || from.getTime() > to.getTime()) return { points: [], source: selected };
  const goals = await loadGoals(projectId, selected);
  return {
    points: summarizeSeries(from, to, goals, await loadFacts(projectId, from, to, goals)),
    source: selected,
  };
}

function missingConversionStorage(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

/** An unmigrated conversions table is "no source", so Pages keeps loading. */
export async function getConversionSources(projectId: string, now = new Date()) {
  try {
    return await loadConversionSources(projectId, now);
  } catch (error) {
    if (!missingConversionStorage(error)) throw error;
    return [];
  }
}

async function loadConversionSources(projectId: string, now = new Date()) {
  const catalog = conversionCatalogSources();
  const period = trailingPeriod(now, 28);
  const [connections, goals, primary, revenueKeys] = await Promise.all([
    prisma.providerConnection.findMany({
      select: { enabled: true, provider: true, status: true },
      where: {
        kind: "analytics",
        projectId,
        provider: { in: catalog.map((entry) => entry.source) },
      },
    }),
    loadGoals(projectId),
    storedPrimary(projectId),
    loadRevenueKeys(projectId),
  ]);
  const pairs = enabledPairs(goals);
  const [sums, lasts] =
    pairs.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.conversionDaily.groupBy({
            _sum: { count: true },
            by: ["source"],
            where: { date: { gte: period.from, lte: period.to }, OR: pairs, projectId },
          }),
          prisma.conversionDaily.groupBy({
            _max: { date: true },
            by: ["source"],
            where: { OR: pairs, projectId },
          }),
        ]);
  const countBySource = new Map(sums.map((row) => [row.source, row._sum.count ?? 0]));
  const lastBySource = new Map(
    lasts.map((row) => [row.source, row._max.date ? utcDayKey(row._max.date) : null]),
  );
  const connected = new Set(
    connections
      .filter((row) => row.status === "connected" && row.enabled)
      .map((row) => row.provider),
  );
  return catalog.map((entry) => ({
    connected: connected.has(entry.source),
    conversions28: countBySource.get(entry.source) ?? 0,
    label: entry.label,
    lastDay: lastBySource.get(entry.source) ?? null,
    logoDomain: entry.logoDomain,
    primary: primary === entry.source,
    reportsRevenue: sourceReportsRevenue(entry.source, revenueKeys),
    source: entry.source,
  }));
}

async function countsByGoal(
  projectId: string,
  period: { from: Date; to: Date },
  goals: readonly { source: ConversionSource; sourceName: string }[],
) {
  if (goals.length === 0) return new Map<string, number>();
  const rows = await prisma.conversionDaily.groupBy({
    _sum: { count: true },
    by: ["name", "source"],
    where: {
      date: { gte: period.from, lte: period.to },
      OR: goals.map((goal) => ({ name: goal.sourceName, source: goal.source })),
      projectId,
    },
  });
  return new Map(rows.map((row) => [`${row.source}:${row.name}`, row._sum.count ?? 0]));
}

export async function getConversionsSettings(
  projectId: string,
  now = new Date(),
): Promise<ConversionsSettingsModel> {
  const period = trailingPeriod(now, 28);
  const [sources, storedGoals, totals, revenueKeys] = await Promise.all([
    getConversionSources(projectId, now),
    prisma.conversionGoal.findMany({
      orderBy: [{ displayName: "asc" }, { source: "asc" }],
      where: { projectId },
    }),
    getConversionTotals(projectId, period),
    loadRevenueKeys(projectId),
  ]);
  const goals = storedGoals.flatMap((goal) =>
    isConversionSource(goal.source) ? [{ ...goal, source: goal.source }] : [],
  );
  const counts = await countsByGoal(projectId, period, goals);
  const connected = sources.filter((source) => source.connected).map((source) => source.source);
  return {
    comparison: comparisonRows(totals, connected),
    goals: goals.map((goal) => ({
      countsRevenue: goal.countsRevenue,
      displayName: goal.displayName,
      enabled: goal.enabled,
      id: goal.id,
      last28: counts.get(`${goal.source}:${goal.sourceName}`) ?? 0,
      reportsRevenue:
        conversionSourceReportsRevenue(goal.source) &&
        revenueKeys.has(`${goal.source}:${goal.sourceName}`),
      source: goal.source,
      sourceLabel: conversionSourceLabel(goal.source),
      sourceName: goal.sourceName,
    })),
    primary: sources.find((source) => source.primary)?.source ?? null,
    showComparison: connected.length >= 2,
    sources,
  };
}
