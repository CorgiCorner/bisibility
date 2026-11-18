import "server-only";
import { normalizeSchedule, type StoredSchedule } from "@/lib/actions/_schedule";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import { assignKeywordsToSchedule } from "@/lib/rank-check/schedules/service-membership";
import { ScheduleMutationError, scheduleNotFound } from "@/lib/schedules/errors";
import {
  commitReviewedScheduleWrite,
  type ScheduleReviewSubmission,
} from "@/lib/schedules/review-commit";
import { checkScheduleMembershipSchema } from "@/lib/schemas/check-schedule";
import { type ApiContext, requireApiActor } from "./context";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";

export async function prepareKeywordScheduleAssignment(
  ctx: ApiContext,
  ids: readonly string[],
  scheduleId: string | null,
) {
  const projectId = ctx.auth.project.id;
  const keywordIds = [...new Set(ids)].sort();
  await requireScheduleKeywords(prisma, projectId, keywordIds);
  if (scheduleId) {
    const target = await prisma.checkSchedule.findFirst({
      where: { projectId, publicId: scheduleId, archivedAt: null },
      select: { publicId: true },
    });
    if (!target) throw scheduleNotFound();
  }
  return { op: "keywords" as const, keywordIds, scheduleId };
}

async function requireScheduleKeywords(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: string[],
) {
  const rows = await tx.keyword.findMany({
    where: { archivedAt: null, projectId, publicId: { in: keywordIds } },
    select: { id: true, publicId: true },
  });
  if (rows.length !== keywordIds.length)
    throw new ScheduleMutationError("schedule_not_found", "Keyword not found.");
  return rows;
}

export async function writeKeywordSchedule<T>(
  ctx: ApiContext,
  ids: readonly string[],
  scheduleId: string | null,
  review: ScheduleReviewSubmission | undefined,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const project = ctx.auth.project;
  const actor = requireApiActor(ctx);
  const change = await prepareKeywordScheduleAssignment(ctx, ids, scheduleId);
  return withApiScheduleAudit(ctx, () =>
    commitReviewedScheduleWrite({
      actor,
      projectId: project.id,
      change,
      options: { atomic: true, gate: true, review, reviewPrincipal: apiScheduleReviewer(ctx) },
      run: async (consent, tx) => {
        if (!tx) throw new Error("Keyword assignment requires a transaction.");
        const rows = await requireScheduleKeywords(tx, project.id, change.keywordIds);
        if (scheduleId) {
          await assignKeywordsToSchedule(
            actor.id,
            project.id,
            checkScheduleMembershipSchema.parse({
              keywordIds: change.keywordIds,
              projectId: project.publicId,
              scheduleId,
            }),
            tx,
            typeof consent === "string" ? consent : undefined,
          );
        } else {
          await setKeywordCadence(
            tx,
            project.id,
            rows.map(({ id }) => id),
            normalizeSchedule({
              frequency: "manual",
              cronExpression: null,
              jitterMinutes: 60,
              timezone: "UTC",
            }),
            ctx.actorId ?? null,
            "frequency",
          );
        }
        return run(tx);
      },
    }),
  );
}

export function legacyKeywordCadenceChange(
  ids: readonly string[],
  schedule: StoredSchedule,
  source: "schedule" | "frequency",
) {
  const { nextCheckAt: _next, ...cadence } = schedule;
  return { op: "keyword-cadence" as const, keywordIds: [...new Set(ids)].sort(), cadence, source };
}
