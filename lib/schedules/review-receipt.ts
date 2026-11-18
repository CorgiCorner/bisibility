import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ScheduleReviewStaleError } from "./errors";
import { loadCreateKeywords } from "./review-load-create-keywords";
import { type ReviewGuard, scheduleRevision } from "./review-load-shared";
import { loadTransfer } from "./review-load-transfers";

const RECEIPT_RETENTION_MS = 10 * 60 * 1000 + 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export async function consumeDurableScheduleReview(
  tx: Tx,
  args: {
    actorId: string | null;
    guard: ReviewGuard;
    projectId: string;
    revision: string;
    token: string;
  },
) {
  await lockProjectForProviderMutation(tx, args.projectId);
  await sweepExpiredReceipts(tx, args.projectId);
  if (args.guard.kind !== "none") {
    const current = await lockedRevision(tx, args.projectId, args.guard);
    if (current !== args.revision) throw new ScheduleReviewStaleError("preview_mismatch");
  }
  try {
    await tx.scheduleReviewReceipt.create({
      data: {
        actorId: args.actorId,
        id: randomUUID(),
        projectId: args.projectId,
        revision: args.revision,
        // The signed token binds the review subject, including for keys with no user FK.
        tokenHash: createHash("sha256").update(args.token).digest("hex"),
      },
    });
  } catch (error) {
    if (isUnique(error)) throw new ScheduleReviewStaleError("preview_reused");
    throw error;
  }
}

async function lockedRevision(tx: Tx, projectId: string, guard: ReviewGuard) {
  if (guard.kind === "transfer")
    return (await loadTransfer(tx, projectId, guard.change, new Date())).revision;
  if (guard.kind === "keywords-create") {
    return (await loadCreateKeywords(tx, projectId, guard.change, new Date())).revision;
  }
  if (guard.kind === "schedule") {
    await tx.$queryRaw`
      SELECT id FROM check_schedules
      WHERE "projectId" = ${projectId} AND "publicId" = ${guard.publicId}
      FOR UPDATE
    `;
    const row = await tx.checkSchedule.findFirst({
      select: { measurementEpoch: true, updatedAt: true },
      where: { projectId, publicId: guard.publicId },
    });
    if (!row) throw new ScheduleReviewStaleError("preview_mismatch");
    return scheduleRevision([guard.publicId, row.measurementEpoch, row.updatedAt]);
  }
  if (guard.kind === "ai") {
    await tx.$queryRaw`
      SELECT id FROM ai_tracking_schedules
      WHERE "projectId" = ${projectId} AND "publicId" = ${guard.publicId}
      FOR UPDATE
    `;
    const row = await tx.aiTrackingSchedule.findFirst({
      select: { updatedAt: true },
      where: { projectId, publicId: guard.publicId },
    });
    if (!row) throw new ScheduleReviewStaleError("preview_mismatch");
    return scheduleRevision([guard.publicId, row.updatedAt]);
  }
  if (guard.kind === "keywords") {
    const ids = [...guard.keywordPublicIds];
    if (guard.schedulePublicId) {
      await tx.$queryRaw`
        SELECT id FROM check_schedules
        WHERE "projectId" = ${projectId} AND "publicId" = ${guard.schedulePublicId}
        FOR UPDATE
      `;
    }
    if (ids.length > 0) {
      await tx.$queryRaw`
        SELECT id FROM keywords
        WHERE "projectId" = ${projectId} AND "publicId" IN (${Prisma.join(ids)})
        FOR UPDATE
      `;
    }
    const target = guard.schedulePublicId
      ? await tx.checkSchedule.findFirst({
          select: { measurementEpoch: true, updatedAt: true },
          where: { projectId, publicId: guard.schedulePublicId },
        })
      : null;
    if (guard.schedulePublicId && !target) throw new ScheduleReviewStaleError("preview_mismatch");
    const keywords = await tx.keyword.findMany({
      select: { checkScheduleId: true, measurementTargetEpoch: true, publicId: true },
      where: { projectId, publicId: { in: ids } },
    });
    const rows = new Map(keywords.map((keyword) => [keyword.publicId, keyword]));
    const keywordParts = ids.flatMap((id) => {
      const keyword = rows.get(id);
      return [id, keyword?.checkScheduleId ?? null, keyword?.measurementTargetEpoch ?? null];
    });
    if (!guard.schedulePublicId || !target) return scheduleRevision(keywordParts);
    return scheduleRevision([
      guard.schedulePublicId,
      target.measurementEpoch,
      target.updatedAt,
      ...keywordParts,
    ]);
  }
  return "";
}

async function sweepExpiredReceipts(tx: Tx, projectId: string) {
  const cutoff = new Date(Date.now() - RECEIPT_RETENTION_MS);
  const expired = await tx.scheduleReviewReceipt.findMany({
    select: { id: true },
    take: 50,
    where: { createdAt: { lt: cutoff }, projectId },
  });
  if (expired.length === 0) return;
  await tx.scheduleReviewReceipt.deleteMany({
    where: { id: { in: expired.map((row) => row.id) } },
  });
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
