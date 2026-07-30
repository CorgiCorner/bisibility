import "server-only";

import { prisma } from "@/lib/db/prisma";
import { QUERY_STATS_LAG_DAYS } from "@/lib/traffic/constants";

const CURRENT_WINDOW_DAYS = 7;
const BASELINE_WINDOW_DAYS = 28;
const SNAPSHOT_TOLERANCE_DAYS = 2;
const STABLE_POSITION_DELTA = 1;

export type CtrDropMetrics = {
  baselineCtr: number;
  baselinePosition: number;
  currentCtr: number;
  currentPosition: number;
};

export type CtrDropSummary = CtrDropMetrics & {
  decreasePct: number;
};

type DateRange = { endDate: string; startDate: string };

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shifted(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function range(start: Date, end: Date): DateRange {
  return { endDate: dateParam(end), startDate: dateParam(start) };
}

export function ctrDropDateRanges(anchor: Date) {
  const currentEnd = shifted(utcDateOnly(anchor), -1);
  const currentStart = shifted(currentEnd, -(CURRENT_WINDOW_DAYS - 1));
  const baselineEnd = shifted(currentStart, -1);
  const baselineStart = shifted(baselineEnd, -(BASELINE_WINDOW_DAYS - 1));

  return {
    baseline: range(baselineStart, baselineEnd),
    current: range(currentStart, currentEnd),
  };
}

function thresholdValue(value: unknown) {
  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : null;
}

export function ctrDropSummary(
  metrics: CtrDropMetrics | null | undefined,
  changePct: unknown,
): CtrDropSummary | null {
  const threshold = thresholdValue(changePct);
  if (!metrics || !threshold || metrics.baselineCtr <= 0) return null;

  const positionDelta = Math.abs(metrics.currentPosition - metrics.baselinePosition);
  if (positionDelta > STABLE_POSITION_DELTA) return null;

  const decreasePct = ((metrics.baselineCtr - metrics.currentCtr) / metrics.baselineCtr) * 100;
  return decreasePct >= threshold ? { ...metrics, decreasePct } : null;
}

export function hasCtrDrop(metrics: CtrDropMetrics | null | undefined, changePct: unknown) {
  return ctrDropSummary(metrics, changePct) !== null;
}

type TrafficSnapshot = {
  ctr: number;
  date: Date;
  impressions: number;
  position: number;
};

export function ctrDropSnapshotDates(anchor: Date) {
  // ctrDropDateRanges ends one day before its anchor. Shift by lag - 1 so the
  // selected current snapshot ends exactly QUERY_STATS_LAG_DAYS before the check.
  const finalizedAnchor = shifted(utcDateOnly(anchor), -(QUERY_STATS_LAG_DAYS - 1));
  const ranges = ctrDropDateRanges(finalizedAnchor);

  return {
    baseline: new Date(`${ranges.baseline.endDate}T00:00:00.000Z`),
    current: new Date(`${ranges.current.endDate}T00:00:00.000Z`),
  };
}

function metricsFromRows(
  baseline: TrafficSnapshot | undefined,
  current: TrafficSnapshot | undefined,
) {
  if (!baseline || !current || baseline.impressions <= 0 || current.impressions <= 0) return null;
  if (baseline.position <= 0 || current.position <= 0) return null;

  return {
    baselineCtr: baseline.ctr,
    baselinePosition: baseline.position,
    currentCtr: current.ctr,
    currentPosition: current.position,
  } satisfies CtrDropMetrics;
}

export async function loadGscCtrMetrics(input: { checkedAt: Date; keywordId: string }) {
  const dates = ctrDropSnapshotDates(input.checkedAt);
  const snapshot = (date: Date, windowDays: number) =>
    prisma.keywordTrafficSnapshot.findFirst({
      orderBy: { date: "desc" },
      select: { ctr: true, date: true, impressions: true, position: true },
      where: {
        date: { gte: shifted(date, -SNAPSHOT_TOLERANCE_DAYS), lte: date },
        keywordId: input.keywordId,
        provider: "gsc",
        windowDays,
      },
    });
  const [baseline, current] = await Promise.all([
    snapshot(dates.baseline, BASELINE_WINDOW_DAYS),
    snapshot(dates.current, CURRENT_WINDOW_DAYS),
  ]);

  return metricsFromRows(baseline ?? undefined, current ?? undefined);
}
