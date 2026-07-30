import "server-only";

import { getRedisClient } from "@/lib/redis/redis";
import type { TemporalHeartbeat } from "./heartbeat-temporal";

export const TEMPORAL_DIGEST_COUNTER_KEY = "ops:heartbeat:temporal-counters:v1";

export type TemporalCounterTotals = {
  missedCatchup: number;
  skippedOverlap: number;
};

export type TemporalPerScheduleCounters = Record<string, TemporalCounterTotals>;

export type TemporalCounterReadState =
  | {
      status: "available";
      perSchedule?: TemporalPerScheduleCounters;
      totals: TemporalCounterTotals;
    }
  | { status: "missing" }
  | { status: "unavailable" };

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parsePerSchedule(value: unknown): TemporalPerScheduleCounters {
  const result: TemporalPerScheduleCounters = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [scheduleId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const counters = entry as Partial<TemporalCounterTotals>;
    if (isCounter(counters.missedCatchup) && isCounter(counters.skippedOverlap)) {
      result[scheduleId] = {
        missedCatchup: counters.missedCatchup,
        skippedOverlap: counters.skippedOverlap,
      };
    }
  }
  return result;
}

type ParsedCounters = { perSchedule?: TemporalPerScheduleCounters; totals: TemporalCounterTotals };

function parseCounters(raw: string): ParsedCounters | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!isCounter(value.missedCatchup) || !isCounter(value.skippedOverlap)) return null;
    const totals = { missedCatchup: value.missedCatchup, skippedOverlap: value.skippedOverlap };
    // Absent "perSchedule" marks legacy totals-only state; an empty map is a real zero baseline.
    if (!("perSchedule" in value)) return { totals };
    return { perSchedule: parsePerSchedule(value.perSchedule), totals };
  } catch {
    return null;
  }
}

export function temporalCounterTotals(heartbeat: TemporalHeartbeat): TemporalCounterTotals {
  return {
    missedCatchup: heartbeat.missedCatchupTotal,
    skippedOverlap: heartbeat.skippedOverlapTotal,
  };
}

export function temporalPerScheduleCounters(
  heartbeat: TemporalHeartbeat,
): TemporalPerScheduleCounters {
  const result: TemporalPerScheduleCounters = {};
  for (const issue of heartbeat.scheduleIssues) {
    result[issue.scheduleId] = {
      missedCatchup: issue.missedCatchup,
      skippedOverlap: issue.skippedOverlap,
    };
  }
  return result;
}

export async function readTemporalDigestCounters(): Promise<TemporalCounterReadState> {
  try {
    const redis = await getRedisClient();
    if (!redis) return { status: "unavailable" };
    const raw = await redis.get(TEMPORAL_DIGEST_COUNTER_KEY);
    if (!raw) return { status: "missing" };
    const parsed = parseCounters(raw);
    if (!parsed) return { status: "unavailable" };
    return parsed.perSchedule === undefined
      ? { status: "available", totals: parsed.totals }
      : { status: "available", perSchedule: parsed.perSchedule, totals: parsed.totals };
  } catch {
    return { status: "unavailable" };
  }
}

export async function writeTemporalDigestCounters(heartbeat: TemporalHeartbeat): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;
    await redis.set(
      TEMPORAL_DIGEST_COUNTER_KEY,
      JSON.stringify({
        ...temporalCounterTotals(heartbeat),
        perSchedule: temporalPerScheduleCounters(heartbeat),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
