-- CreateEnum
CREATE TYPE "AlertDeliveryState" AS ENUM ('pending', 'digest_pending', 'digesting', 'digested', 'suppressed', 'delivering', 'delivered', 'dead_letter', 'skipped');

-- AlterTable
ALTER TABLE "triggered_alerts" ADD COLUMN     "deliveryState" "AlertDeliveryState" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "alert_rule_daily_stats" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "overflowNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_daily_stats_ruleId_day_key" ON "alert_rule_daily_stats"("ruleId", "day");

-- CreateIndex
CREATE INDEX "triggered_alerts_deliveryState_firedAt_idx" ON "triggered_alerts"("deliveryState", "firedAt");

-- AddForeignKey
ALTER TABLE "alert_rule_daily_stats" ADD CONSTRAINT "alert_rule_daily_stats_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
