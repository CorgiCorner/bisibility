import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { plannedOccurrenceForKey } from "./occurrence";

type ReconcileDatabase = Pick<Prisma.TransactionClient, "checkSchedule" | "rankCheckRun">;

function occurrenceKey(spec: Prisma.JsonValue) {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) return null;
  const value = (spec as Record<string, Prisma.JsonValue>).occurrenceKey;
  return typeof value === "string" ? value : null;
}

export async function reconcilePlannedRunsForSchedule(
  scheduleId: string,
  database: ReconcileDatabase = prisma,
  options: { deleting?: boolean } = {},
) {
  const schedule = await database.checkSchedule.findUnique({
    select: {
      archivedAt: true,
      cronExpression: true,
      enabled: true,
      frequency: true,
      jitterMinutes: true,
      project: { select: { defaults: { select: { timezone: true } } } },
      publicId: true,
      timeOfDay: true,
      timezone: true,
    },
    where: { id: scheduleId },
  });
  if (!schedule) return { deleted: 0 };
  const runs = await database.rankCheckRun.findMany({
    select: {
      id: true,
      items: { select: { id: true }, take: 1 },
      plannedFor: true,
      selectionSpec: true,
      status: true,
    },
    where: { checkScheduleId: scheduleId, status: { in: ["blocked", "planned"] } },
  });
  const cadence = {
    ...schedule,
    timezone: schedule.timezone ?? schedule.project.defaults?.timezone ?? "UTC",
  };
  const staleIds = runs.flatMap((run) => {
    if (run.status === "blocked" && run.items.length > 0) return [];
    if (options.deleting) return [run.id];
    const key = occurrenceKey(run.selectionSpec);
    const occurrence =
      !schedule.archivedAt && schedule.enabled && key
        ? plannedOccurrenceForKey(cadence, key)
        : null;
    const anchorMatches =
      occurrence !== null &&
      run.plannedFor !== null &&
      occurrence.plannedFor.getTime() === run.plannedFor.getTime();
    return anchorMatches ? [] : [run.id];
  });
  if (staleIds.length === 0) return { deleted: 0 };
  const deleted = await database.rankCheckRun.deleteMany({
    where: { id: { in: staleIds }, status: { in: ["blocked", "planned"] } },
  });
  return { deleted: deleted.count };
}
