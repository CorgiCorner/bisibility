import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type PurgeRankCheckRawPayloadsInput,
  type PurgeRankCheckRawPayloadsSummary,
  RANK_CHECK_RAW_PURGE_BATCH_SIZE,
} from "@/lib/rank-check/raw-retention-types";
import { z } from "zod";

const progressIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

export type DurableProgress = {
  batchCount: number;
  completed: boolean;
  cutoff: Date | null;
  hasMore: boolean;
  maxBatches: number;
  resultClearedAt: Date | null;
  retentionDays: number | null;
  updatedCount: number;
};

type CommittedBatch = {
  count: number;
  progress: DurableProgress;
};

export function parseRankCheckRawPurgeProgressId(value: string) {
  return progressIdSchema.parse(value);
}

export async function loadRankCheckRawPurgeProgress(id: string) {
  return prisma.rankCheckRawPurgeProgress.findUnique({ where: { id } });
}

function summary(progress: DurableProgress): PurgeRankCheckRawPayloadsSummary {
  if (progress.cutoff === null || progress.retentionDays === null) {
    throw new Error("Rank-check raw purge progress result was already cleared.");
  }
  return {
    batchCount: progress.batchCount,
    batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
    cutoff: progress.cutoff,
    hasMore: progress.hasMore,
    retentionDays: progress.retentionDays,
    updated: progress.updatedCount,
  };
}

export async function hasEligibleRankCheckRawPayloads(
  transaction: Pick<Prisma.TransactionClient, "$queryRaw">,
  cutoff: Date,
) {
  const rows = await transaction.$queryRaw<Array<{ hasMore: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "rank_checks"
      WHERE "raw" IS NOT NULL
        AND "checkedAt" < ${cutoff}
    ) AS "hasMore"
  `);
  return rows[0]?.hasMore ?? false;
}

async function commitDurableBatch(
  progressId: string,
  cutoff: Date,
  retentionDays: number,
  maxBatches: number,
): Promise<CommittedBatch> {
  return prisma.$transaction(async (transaction) => {
    await transaction.rankCheckRawPurgeProgress.upsert({
      create: { cutoff, id: progressId, maxBatches, retentionDays },
      update: {},
      where: { id: progressId },
    });
    const rows = await transaction.$queryRaw<DurableProgress[]>(Prisma.sql`
      SELECT
        "batchCount",
        "completed",
        "cutoff",
        "hasMore",
        "maxBatches",
        "resultClearedAt",
        "retentionDays",
        "updatedCount"
      FROM "rank_check_raw_purge_progress"
      WHERE "id" = ${progressId}
      FOR UPDATE
    `);
    const current = rows[0];
    if (!current) throw new Error("Rank-check raw purge progress could not be locked.");
    if (current.resultClearedAt !== null) {
      throw new Error("Rank-check raw purge progress result was already cleared.");
    }
    if (current.completed) return { count: 0, progress: current };
    if (current.cutoff === null || current.retentionDays === null) {
      throw new Error("Active rank-check raw purge progress is incomplete.");
    }

    const count = await transaction.$executeRaw(Prisma.sql`
      WITH "batch" AS (
        SELECT "id"
        FROM "rank_checks"
        WHERE "raw" IS NOT NULL
          AND "checkedAt" < ${current.cutoff}
        ORDER BY "checkedAt" ASC, "id" ASC
        LIMIT ${RANK_CHECK_RAW_PURGE_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "rank_checks" AS "target"
      SET "raw" = NULL
      FROM "batch"
      WHERE "target"."id" = "batch"."id"
    `);
    if (count > 0) {
      await writeAudit(
        {
          action: "rank_check.raw_purge",
          actorId: null,
          after: {
            batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
            cutoff: current.cutoff.toISOString(),
            retentionDays: current.retentionDays,
            updatedCount: count,
          },
          projectId: null,
          targetId: "rank_checks",
          targetType: "system",
        },
        transaction,
      );
    }

    const batchCount = current.batchCount + (count > 0 ? 1 : 0);
    const atBound = batchCount >= current.maxBatches;
    const completed = count < RANK_CHECK_RAW_PURGE_BATCH_SIZE || atBound;
    const hasMore =
      count === RANK_CHECK_RAW_PURGE_BATCH_SIZE && atBound
        ? await hasEligibleRankCheckRawPayloads(transaction, current.cutoff)
        : false;
    const progress = await transaction.rankCheckRawPurgeProgress.update({
      data: {
        batchCount,
        completed,
        hasMore,
        updatedCount: current.updatedCount + count,
      },
      where: { id: progressId },
    });
    return { count, progress };
  });
}

export async function purgeWithDurableProgress(
  progressId: string,
  cutoff: Date,
  retentionDays: number,
  maxBatches: number,
  onBatchCompleted?: PurgeRankCheckRawPayloadsInput["onBatchCompleted"],
) {
  while (true) {
    const committed = await commitDurableBatch(progressId, cutoff, retentionDays, maxBatches);
    const result = summary(committed.progress);
    if (committed.count > 0) {
      await onBatchCompleted?.({
        batchCount: result.batchCount,
        cutoff: result.cutoff as Date,
        retentionDays: result.retentionDays as number,
        updated: result.updated,
      });
    }
    if (committed.progress.completed) return result;
  }
}

export async function cleanupRankCheckRawPurgeProgress(progressId: string) {
  const id = parseRankCheckRawPurgeProgressId(progressId);
  const result = await prisma.rankCheckRawPurgeProgress.updateMany({
    data: {
      batchCount: 0,
      cutoff: null,
      hasMore: false,
      resultClearedAt: new Date(),
      retentionDays: null,
      updatedCount: 0,
    },
    where: { completed: true, id, resultClearedAt: null },
  });
  return { cleared: result.count };
}
