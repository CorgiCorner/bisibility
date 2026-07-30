CREATE TABLE "rank_check_raw_purge_progress" (
    "id" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3),
    "retentionDays" INTEGER,
    "maxBatches" INTEGER NOT NULL,
    "batchCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "hasMore" BOOLEAN NOT NULL DEFAULT false,
    "resultClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_check_raw_purge_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rank_check_raw_purge_progress_retention_days_check"
      CHECK ("retentionDays" IS NULL OR "retentionDays" BETWEEN 1 AND 3650),
    CONSTRAINT "rank_check_raw_purge_progress_max_batches_check"
      CHECK ("maxBatches" BETWEEN 1 AND 10),
    CONSTRAINT "rank_check_raw_purge_progress_batch_count_check"
      CHECK ("batchCount" BETWEEN 0 AND "maxBatches"),
    CONSTRAINT "rank_check_raw_purge_progress_updated_count_check"
      CHECK ("updatedCount" >= 0)
);
