-- AlterTable
ALTER TABLE "rank_check_runs" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "rank_check_runs_status_claimedAt_id_idx"
  ON "rank_check_runs"("status", "claimedAt", "id");
