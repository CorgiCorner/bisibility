-- Prisma cannot represent partial indexes; keep this index migration-only.
CREATE INDEX "rank_checks_checkedAt_id_raw_not_null_idx"
ON "rank_checks" ("checkedAt", "id")
WHERE "raw" IS NOT NULL;
