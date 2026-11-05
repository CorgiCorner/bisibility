-- AlterTable
ALTER TABLE "alert_evaluation_intents" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "predecessorRankCheckId" TEXT;

-- DropIndex
DROP INDEX "alert_evaluation_intents_state_createdAt_idx";

-- CreateIndex
CREATE INDEX "alert_evaluation_intents_state_leaseUntil_createdAt_idx" ON "alert_evaluation_intents"("state", "leaseUntil", "createdAt");
