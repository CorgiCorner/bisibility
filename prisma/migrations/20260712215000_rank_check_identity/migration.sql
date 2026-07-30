-- Precondition: the read-only duplicate report for (keywordId, checkedAt) is
-- empty, or its reviewed duplicates have been backed up and removed.
CREATE UNIQUE INDEX "rank_checks_keywordId_checkedAt_key"
ON "rank_checks"("keywordId", "checkedAt");

DROP INDEX "rank_checks_keywordId_checkedAt_idx";
