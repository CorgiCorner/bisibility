import type { Prisma } from "@/lib/generated/prisma/client";

// A linked check can be preallocated while its target is still queued.
export const startedRunItemWhere = {
  OR: [
    { startedAt: { not: null } },
    { rankCheckId: { not: null }, status: { in: ["running", "completed", "failed", "deferred"] } },
  ],
} satisfies Prisma.RankCheckRunItemWhereInput;

// Prefer an in-flight target; otherwise expose the earliest queued start.
export const pendingRunItems = {
  orderBy: [{ status: "desc" }, { notBefore: { sort: "asc", nulls: "first" } }],
  select: { notBefore: true, status: true },
  take: 1,
  where: { status: { in: ["queued", "running"] } },
} satisfies Prisma.RankCheckRunSelect["items"];

export function runScheduleTiming(
  schedule: {
    frequency: string;
    timeOfDay: string | null;
    jitterMinutes: number;
  } | null,
) {
  if (!schedule) return null;
  if (schedule.timeOfDay === null && schedule.frequency !== "custom_cron") {
    return schedule.frequency === "daily" ? "spread across the day" : "spread across the interval";
  }
  return schedule.jitterMinutes > 0
    ? `starts within ${schedule.jitterMinutes} min of the scheduled time`
    : "starts at the scheduled time";
}

export function runStartFacts(run: {
  _count: { items: number };
  items: { status: string; notBefore: Date | null }[];
  status: string;
  checkSchedule: Parameters<typeof runScheduleTiming>[0];
}) {
  const pending = run.items[0];
  const hasRunningTargets = pending?.status === "running";
  const nextCheckAt =
    (run.status === "queued" || run.status === "running") && !hasRunningTargets
      ? (pending?.notBefore?.toISOString() ?? null)
      : null;
  return {
    firstNotBefore: run.status === "queued" ? nextCheckAt : null,
    hasRunningTargets,
    nextCheckAt,
    scheduleTiming: runScheduleTiming(run.checkSchedule),
    startedTargets: run._count.items,
  };
}
