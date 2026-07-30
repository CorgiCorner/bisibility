import "server-only";

import { CronExpressionParser } from "cron-parser";
import { DAILY_INTERVAL_MS, stableIntervalPhaseMs, WEEKLY_INTERVAL_MS } from "./interval-phase";
import type { RankCheckScheduleInput } from "./schedule";
import { sha256Bytes } from "./sha256";

export function intervalPhaseSeconds(keywordId: string, intervalSeconds: number) {
  return stableIntervalPhaseMs(keywordId, intervalSeconds * 1_000) / 1_000;
}

function hashModulo(value: string, modulo: number) {
  const digest = sha256Bytes(value);
  let hash = 0n;
  for (const byte of digest.subarray(0, 8)) {
    hash = (hash << 8n) | BigInt(byte);
  }
  return Number(hash % BigInt(modulo));
}

export function deterministicJitterSeconds(keywordId: string, jitterMinutes?: number | null) {
  const windowSeconds = Math.max(0, Math.floor(jitterMinutes ?? 60)) * 60;
  if (windowSeconds === 0) return 0;

  return hashModulo(`${keywordId}:dispatcher-jitter`, windowSeconds + 1);
}

function nextInterval(keywordId: string, intervalMs: number, from: Date, jitterSeconds: number) {
  const offsetMs = stableIntervalPhaseMs(keywordId, intervalMs) + jitterSeconds * 1_000;
  const cycle = Math.floor((from.getTime() - offsetMs) / intervalMs) + 1;
  return new Date(cycle * intervalMs + offsetMs);
}

function zonedAnchorCron(schedule: RankCheckScheduleInput) {
  const anchor = schedule.nextCheckAt ? new Date(schedule.nextCheckAt) : null;
  if (!anchor || Number.isNaN(anchor.getTime())) {
    throw new Error("Monthly schedules require nextCheckAt.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone ?? "UTC",
    hourCycle: "h23",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(anchor);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return `${value("minute")} ${value("hour")} ${Math.min(value("day"), 28)} * *`;
}

function nextCron(expression: string, timezone: string, from: Date, jitterSeconds: number) {
  const jitterMs = jitterSeconds * 1_000;
  const interval = CronExpressionParser.parse(expression, {
    currentDate: new Date(from.getTime() - jitterMs),
    tz: timezone,
  });
  let next = new Date(interval.next().getTime() + jitterMs);
  if (next <= from) {
    next = new Date(interval.next().getTime() + jitterMs);
  }
  return next;
}

export function computeDispatcherNextCheckAt(
  schedule: RankCheckScheduleInput,
  keywordId: string,
  from = new Date(),
) {
  const jitterSeconds = deterministicJitterSeconds(keywordId, schedule.jitterMinutes);

  if (schedule.frequency === "daily") {
    return nextInterval(keywordId, DAILY_INTERVAL_MS, from, jitterSeconds);
  }
  if (schedule.frequency === "weekly") {
    return nextInterval(keywordId, WEEKLY_INTERVAL_MS, from, jitterSeconds);
  }

  const timezone = schedule.timezone ?? "UTC";
  if (schedule.frequency === "monthly") {
    return nextCron(zonedAnchorCron(schedule), timezone, from, jitterSeconds);
  }
  if (schedule.frequency === "custom_cron" && schedule.cronExpression) {
    return nextCron(schedule.cronExpression, timezone, from, jitterSeconds);
  }

  throw new Error("Only automatic rank-check schedules can be dispatched.");
}

export function dispatcherNextCheckAtMatchesRecurrence(
  schedule: RankCheckScheduleInput,
  keywordId: string,
  nextCheckAt: Date,
  referenceAt = new Date(),
) {
  if (!Number.isFinite(nextCheckAt.getTime()) || !Number.isFinite(referenceAt.getTime())) {
    return false;
  }
  try {
    if (nextCheckAt > referenceAt) {
      return (
        computeDispatcherNextCheckAt(schedule, keywordId, referenceAt).getTime() ===
        nextCheckAt.getTime()
      );
    }
    return (
      computeDispatcherNextCheckAt(
        schedule,
        keywordId,
        new Date(nextCheckAt.getTime() - 1),
      ).getTime() === nextCheckAt.getTime()
    );
  } catch {
    return false;
  }
}
