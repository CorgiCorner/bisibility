import type { Prisma } from "@/lib/generated/prisma/client";
import { mirrorScheduleToKeywords } from "@/lib/rank-check/schedules/service-membership";

type CreatedKeyword = { id: string; publicId: string };

class KeywordScheduleAssignmentError extends Error {
  readonly code = "keyword_schedule_invalid";

  constructor() {
    super("Choose a current schedule for this project.");
    this.name = "KeywordScheduleAssignmentError";
  }
}

type ScheduleAssignmentClient = Prisma.TransactionClient;

/** The project's own schedule for a client-supplied public id, or a rejection before any write. */
export async function resolveCheckSchedule(
  tx: ScheduleAssignmentClient,
  projectId: string,
  publicId?: string | null,
) {
  if (!publicId) return null;
  const schedule = await tx.checkSchedule.findFirst({
    where: { archivedAt: null, enabled: true, projectId, publicId },
  });
  if (!schedule) throw new KeywordScheduleAssignmentError();
  return schedule;
}

/**
 * Link only the rows THIS submission created. Nothing existing is touched.
 *
 * The rows may already carry a per-keyword cadence from the same submission, and
 * `KeywordSchedule.keywordId` is unique, so the assigned schedule is mirrored through the same
 * upsert every other cadence-changing path uses. That call also recomputes the dispatch states,
 * which the seeding pass wrote (or skipped) before this schedule existed for these rows.
 */
export async function linkCheckSchedule(
  tx: ScheduleAssignmentClient,
  projectId: string,
  schedule: NonNullable<Awaited<ReturnType<typeof resolveCheckSchedule>>>,
  created: readonly CreatedKeyword[],
) {
  if (created.length === 0) return;
  const keywordIds = created.map((keyword) => keyword.id);
  await tx.keyword.updateMany({
    data: { checkScheduleId: schedule.id },
    where: { id: { in: keywordIds } },
  });
  await mirrorScheduleToKeywords(tx, projectId, schedule, keywordIds);
}
