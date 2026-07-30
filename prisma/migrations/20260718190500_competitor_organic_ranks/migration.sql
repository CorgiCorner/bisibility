ALTER TABLE "rank_checks" ADD COLUMN "organicRanks" JSONB;

CREATE INDEX "rank_checks_keywordId_checkedAt_id_idx"
ON "rank_checks"("keywordId", "checkedAt" DESC, "id" DESC);
