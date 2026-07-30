import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

export const RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS_DEFAULT = 7;
export const RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE = 500;
export const RANK_CHECK_RAW_PROGRESS_SWEEP_MAX_PAGES_PER_PHASE = 4;

const fenceRetentionDaysSchema = z.coerce.number().int().min(2).max(3650);

type SweepOptions = {
  maxPagesPerPhase?: number;
  now?: Date;
};

type SweepPhaseResult = {
  count: number;
  hasMore: boolean;
  pages: number;
};

export function getRankCheckRawProgressFenceRetentionDays() {
  const raw = process.env.RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS?.trim();
  return raw
    ? fenceRetentionDaysSchema.parse(raw)
    : RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS_DEFAULT;
}

function assertMaxPages(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > RANK_CHECK_RAW_PROGRESS_SWEEP_MAX_PAGES_PER_PHASE
  ) {
    throw new Error(
      `maxPagesPerPhase must be an integer from 1 to ${RANK_CHECK_RAW_PROGRESS_SWEEP_MAX_PAGES_PER_PHASE}.`,
    );
  }
}

async function scrubTerminalFencePage(now: Date) {
  return prisma.$executeRaw(Prisma.sql`
    WITH "batch" AS (
      SELECT "id"
      FROM "rank_check_raw_purge_progress"
      WHERE "completed"
        AND "resultClearedAt" IS NULL
      ORDER BY "id"
      LIMIT ${RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "rank_check_raw_purge_progress" AS "target"
    SET
      "batchCount" = 0,
      "cutoff" = NULL,
      "hasMore" = false,
      "resultClearedAt" = ${now},
      "retentionDays" = NULL,
      "updatedAt" = ${now},
      "updatedCount" = 0
    FROM "batch"
    WHERE "target"."id" = "batch"."id"
  `);
}

async function deleteExpiredFencePage(cutoff: Date) {
  return prisma.$executeRaw(Prisma.sql`
    WITH "batch" AS (
      SELECT "id"
      FROM "rank_check_raw_purge_progress"
      WHERE "completed"
        AND "resultClearedAt" < ${cutoff}
      ORDER BY "resultClearedAt", "id"
      LIMIT ${RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "rank_check_raw_purge_progress" AS "target"
    USING "batch"
    WHERE "target"."id" = "batch"."id"
  `);
}

async function runBoundedPhase(
  operation: () => Promise<number>,
  maxPages: number,
): Promise<SweepPhaseResult> {
  let count = 0;
  let pages = 0;
  let lastPageCount = 0;
  while (pages < maxPages) {
    lastPageCount = await operation();
    pages += 1;
    count += lastPageCount;
    if (lastPageCount < RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE) break;
  }
  return {
    count,
    hasMore: pages === maxPages && lastPageCount === RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE,
    pages,
  };
}

export async function sweepRankCheckRawPurgeProgress({
  maxPagesPerPhase = RANK_CHECK_RAW_PROGRESS_SWEEP_MAX_PAGES_PER_PHASE,
  now = new Date(),
}: SweepOptions = {}) {
  assertMaxPages(maxPagesPerPhase);
  if (Number.isNaN(now.getTime())) throw new Error("now must be a valid Date.");
  const fenceRetentionDays = getRankCheckRawProgressFenceRetentionDays();
  const cutoff = new Date(now.getTime() - fenceRetentionDays * 24 * 60 * 60 * 1000);
  const scrub = await runBoundedPhase(() => scrubTerminalFencePage(now), maxPagesPerPhase);
  const deletion = await runBoundedPhase(() => deleteExpiredFencePage(cutoff), maxPagesPerPhase);
  return {
    cutoff,
    deleted: deletion.count,
    deletePages: deletion.pages,
    fenceRetentionDays,
    hasMore: scrub.hasMore || deletion.hasMore,
    pageSize: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE,
    scrubbed: scrub.count,
    scrubPages: scrub.pages,
  };
}
