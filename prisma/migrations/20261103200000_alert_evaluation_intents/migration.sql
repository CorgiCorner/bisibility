-- CreateTable
CREATE TABLE "alert_evaluation_intents" (
    "rankCheckId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "alert_evaluation_intents_pkey" PRIMARY KEY ("rankCheckId")
);

-- CreateIndex
CREATE INDEX "alert_evaluation_intents_state_createdAt_idx" ON "alert_evaluation_intents"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "alert_evaluation_intents" ADD CONSTRAINT "alert_evaluation_intents_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
