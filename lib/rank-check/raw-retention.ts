import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { deploymentMode } from "@/lib/deployment/deployment";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  cleanupRankCheckRawPurgeProgress,
  hasEligibleRankCheckRawPayloads,
  loadRankCheckRawPurgeProgress,
  parseRankCheckRawPurgeProgressId,
  purgeWithDurableProgress,
} from "@/lib/rank-check/raw-retention-progress";
import {
  type PurgeRankCheckRawPayloadsInput,
  type PurgeRankCheckRawPayloadsSummary,
  RANK_CHECK_RAW_PURGE_BATCH_SIZE,
  RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
} from "@/lib/rank-check/raw-retention-types";
import { z } from "zod";

const DEFAULT_CLOUD_RETENTION_DAYS = 90;
const retentionDaysSchema = z.coerce.number().int().min(1).max(3650);

export type {
  PurgeRankCheckRawPayloadsInput,
  PurgeRankCheckRawPayloadsProgress,
  PurgeRankCheckRawPayloadsSummary,
} from "@/lib/rank-check/raw-retention-types";
export {
  cleanupRankCheckRawPurgeProgress,
  RANK_CHECK_RAW_PURGE_BATCH_SIZE,
  RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
};

function assertBatchLimit(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY
  ) {
    throw new Error(
      `maxBatches must be an integer from 1 to ${RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY}.`,
    );
  }
}

export function getRankCheckRawRetentionDays() {
  if (deploymentMode() === "cloud") return DEFAULT_CLOUD_RETENTION_DAYS;
  const raw = process.env.RANK_CHECK_RAW_RETENTION_DAYS?.trim();
  if (!raw || raw.toLowerCase() === "unlimited") return null;
  return retentionDaysSchema.parse(raw);
}

async function purgeWithoutDurableProgress(
  cutoff: Date,
  retentionDays: number,
  initialBatchCount: number,
  initialUpdated: number,
  maxBatches: number,
  onBatchCompleted?: PurgeRankCheckRawPayloadsInput["onBatchCompleted"],
) {
  let batchCount = initialBatchCount;
  let updated = initialUpdated;
  let filledLastBatch = batchCount >= maxBatches;

  while (batchCount < maxBatches) {
    const count = await prisma.$transaction(async (transaction) => {
      const updatedCount = await transaction.$executeRaw(Prisma.sql`
        WITH "batch" AS (
          SELECT "id"
          FROM "rank_checks"
          WHERE "raw" IS NOT NULL
            AND "checkedAt" < ${cutoff}
          ORDER BY "checkedAt" ASC, "id" ASC
          LIMIT ${RANK_CHECK_RAW_PURGE_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "rank_checks" AS "target"
        SET "raw" = NULL
        FROM "batch"
        WHERE "target"."id" = "batch"."id"
      `);
      if (updatedCount === 0) return 0;
      await writeAudit(
        {
          action: "rank_check.raw_purge",
          actorId: null,
          after: {
            batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
            cutoff: cutoff.toISOString(),
            retentionDays,
            updatedCount,
          },
          projectId: null,
          targetId: "rank_checks",
          targetType: "system",
        },
        transaction,
      );
      return updatedCount;
    });
    if (count === 0) break;
    batchCount += 1;
    updated += count;
    filledLastBatch = count === RANK_CHECK_RAW_PURGE_BATCH_SIZE;
    await onBatchCompleted?.({ batchCount, cutoff, retentionDays, updated });
    if (!filledLastBatch) break;
  }

  const hasMore =
    filledLastBatch && batchCount >= maxBatches
      ? await hasEligibleRankCheckRawPayloads(prisma, cutoff)
      : false;
  return {
    batchCount,
    batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
    cutoff,
    hasMore,
    retentionDays,
    updated,
  };
}

export async function purgeRankCheckRawPayloads({
  cutoff: requestedCutoff,
  initialBatchCount = 0,
  initialUpdated = 0,
  maxBatches = RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
  now = new Date(),
  onBatchCompleted,
  progressId: requestedProgressId,
  retentionDays,
}: PurgeRankCheckRawPayloadsInput = {}): Promise<PurgeRankCheckRawPayloadsSummary> {
  assertBatchLimit(maxBatches);
  if (!Number.isSafeInteger(initialBatchCount) || initialBatchCount < 0) {
    throw new Error("initialBatchCount must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(initialUpdated) || initialUpdated < 0) {
    throw new Error("initialUpdated must be a non-negative integer.");
  }
  const progressId = requestedProgressId
    ? parseRankCheckRawPurgeProgressId(requestedProgressId)
    : undefined;
  const existing = progressId ? await loadRankCheckRawPurgeProgress(progressId) : null;
  if (existing?.resultClearedAt) {
    throw new Error("Rank-check raw purge progress result was already cleared.");
  }
  const days =
    existing?.retentionDays ??
    (retentionDays === undefined
      ? getRankCheckRawRetentionDays()
      : retentionDays === null
        ? null
        : retentionDaysSchema.parse(retentionDays));
  if (days === null) {
    return {
      batchCount: 0,
      batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
      cutoff: null,
      hasMore: false,
      retentionDays: null,
      updated: 0,
    };
  }

  const cutoff =
    existing?.cutoff ?? requestedCutoff ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  if (Number.isNaN(cutoff.getTime())) throw new Error("cutoff must be a valid Date.");
  if (progressId) {
    return purgeWithDurableProgress(
      progressId,
      cutoff,
      days,
      existing?.maxBatches ?? maxBatches,
      onBatchCompleted,
    );
  }
  return purgeWithoutDurableProgress(
    cutoff,
    days,
    initialBatchCount,
    initialUpdated,
    maxBatches,
    onBatchCompleted,
  );
}
