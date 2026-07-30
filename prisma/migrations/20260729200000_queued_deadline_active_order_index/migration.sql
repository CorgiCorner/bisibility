DROP INDEX "queued_rank_check_batches_state_queueDeadlineAt_id_idx";

-- Prisma cannot represent partial indexes; keep this index migration-only.
CREATE INDEX "queued_rank_check_batches_active_queueDeadlineAt_id_idx"
ON "queued_rank_check_batches" ("queueDeadlineAt", "id")
WHERE "state" IN ('ambiguous', 'prepared', 'ready', 'submitted', 'submitting');
