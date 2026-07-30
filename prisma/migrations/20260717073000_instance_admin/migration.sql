-- AlterTable
ALTER TABLE "users" ADD COLUMN "isInstanceAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "rank_checks_checkedAt_idx" ON "rank_checks"("checkedAt");

-- CreateIndex
CREATE INDEX "rank_checks_scheduledAt_idx" ON "rank_checks"("scheduledAt");

-- CreateIndex
CREATE INDEX "rank_checks_startedAt_idx" ON "rank_checks"("startedAt");

-- CreateIndex
CREATE INDEX "rank_checks_status_checkedAt_idx" ON "rank_checks"("status", "checkedAt");
