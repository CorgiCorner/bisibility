-- CreateTable
CREATE TABLE "alert_rule_recipients" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rule_recipients_userId_idx" ON "alert_rule_recipients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_recipients_ruleId_userId_key" ON "alert_rule_recipients"("ruleId", "userId");

-- CreateIndex
CREATE INDEX "delivery_attempts_attemptedAt_idx" ON "delivery_attempts"("attemptedAt");

-- CreateIndex
CREATE INDEX "triggered_alerts_firedAt_idx" ON "triggered_alerts"("firedAt");

-- AddForeignKey
ALTER TABLE "alert_rule_recipients" ADD CONSTRAINT "alert_rule_recipients_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_recipients" ADD CONSTRAINT "alert_rule_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing creator-owned alert rules.
INSERT INTO "alert_rule_recipients" ("id", "ruleId", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "createdById", NOW(), NOW()
FROM "alert_rules" WHERE "createdById" IS NOT NULL;
