CREATE INDEX "rank_check_raw_purge_progress_reclaim_idx"
ON "rank_check_raw_purge_progress" ("completed", "resultClearedAt", "id");

-- Prisma cannot represent partial indexes; keep the missed-cleanup scrub index migration-only.
CREATE INDEX "rank_check_raw_purge_progress_scrub_idx"
ON "rank_check_raw_purge_progress" ("id")
WHERE "completed" AND "resultClearedAt" IS NULL;
