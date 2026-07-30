import "server-only";

import { getRedisClient } from "@/lib/redis/redis";
import type { TemporalHeartbeat } from "./heartbeat-temporal";
import { WORKER_STALE_AFTER_MS } from "./liveness";

export const TEMPORAL_SNAPSHOT_KEY = "ops:temporal:snapshot";

export type TemporalSnapshotState = {
  collectedAt: string;
  heartbeat: TemporalHeartbeat;
  status: "ok" | "stale";
};

type TemporalSnapshotRecord = Omit<TemporalSnapshotState, "status">;

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validScheduleIssues(value: unknown): value is TemporalHeartbeat["scheduleIssues"] {
  return (
    Array.isArray(value) &&
    value.every(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        (issue.gapAt === null || validTimestamp(issue.gapAt)) &&
        nonNegativeNumber(issue.missedCatchup) &&
        (issue.recoveredAt === null || validTimestamp(issue.recoveredAt)) &&
        typeof issue.scheduleId === "string" &&
        nonNegativeNumber(issue.skippedOverlap),
    )
  );
}

function sanitizeHeartbeat(value: unknown): TemporalHeartbeat | null {
  if (!value || typeof value !== "object") return null;
  const heartbeat = value as Partial<TemporalHeartbeat>;
  if (
    !nonNegativeNumber(heartbeat.inspectionErrors) ||
    !Array.isArray(heartbeat.issueSchedules) ||
    !heartbeat.issueSchedules.every((issue) => typeof issue === "string") ||
    !nonNegativeNumber(heartbeat.missedCatchupTotal) ||
    !(heartbeat.nextActionAt === null || validTimestamp(heartbeat.nextActionAt)) ||
    !nonNegativeNumber(heartbeat.recentActions) ||
    !validScheduleIssues(heartbeat.scheduleIssues) ||
    !nonNegativeNumber(heartbeat.schedules) ||
    !nonNegativeNumber(heartbeat.skippedOverlapTotal)
  ) {
    return null;
  }

  return {
    inspectionErrors: heartbeat.inspectionErrors,
    issueSchedules: [...heartbeat.issueSchedules],
    missedCatchupTotal: heartbeat.missedCatchupTotal,
    nextActionAt: heartbeat.nextActionAt,
    recentActions: heartbeat.recentActions,
    scheduleIssues: heartbeat.scheduleIssues.map((issue) => ({ ...issue })),
    schedules: heartbeat.schedules,
    skippedOverlapTotal: heartbeat.skippedOverlapTotal,
  };
}

function parseSnapshot(raw: string): TemporalSnapshotRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<TemporalSnapshotRecord>;
    if (!validTimestamp(value.collectedAt)) return null;
    const heartbeat = sanitizeHeartbeat(value.heartbeat);
    return heartbeat ? { collectedAt: value.collectedAt, heartbeat } : null;
  } catch {
    return null;
  }
}

/** Read the worker-published snapshot without attempting a live Temporal connection. */
export async function getTemporalSnapshot(now = new Date()): Promise<TemporalSnapshotState | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;
    const raw = await redis.get(TEMPORAL_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = parseSnapshot(raw);
    if (!snapshot) return null;
    return {
      ...snapshot,
      status:
        now.getTime() - Date.parse(snapshot.collectedAt) > WORKER_STALE_AFTER_MS ? "stale" : "ok",
    };
  } catch {
    return null;
  }
}

/** Best-effort worker publisher. A failed inspection never overwrites the last good snapshot. */
export async function publishTemporalSnapshot(
  now = new Date(),
  inspect?: (now: Date) => Promise<TemporalHeartbeat>,
): Promise<boolean> {
  try {
    if (!inspect) throw new Error("Temporal inspection is worker-only");
    const heartbeat = sanitizeHeartbeat(await inspect(now));
    if (!heartbeat) throw new Error("Invalid Temporal heartbeat");
    const redis = await getRedisClient();
    if (!redis) return false;
    await redis.set(
      TEMPORAL_SNAPSHOT_KEY,
      JSON.stringify({
        collectedAt: now.toISOString(),
        heartbeat,
      } satisfies TemporalSnapshotRecord),
    );
    return true;
  } catch {
    console.error("[ops] Temporal snapshot refresh failed");
    return false;
  }
}
