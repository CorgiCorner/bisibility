-- Fire-on-transition and workflow-retry idempotency for triggered alerts.
-- Deduplicate retry artifacts first: keep the earliest row per
-- (ruleId, keywordId, rankCheckId) so the unique index can be created.
DELETE FROM "triggered_alerts" dup
USING "triggered_alerts" keep
WHERE dup."rankCheckId" IS NOT NULL
  AND keep."ruleId" = dup."ruleId"
  AND keep."keywordId" = dup."keywordId"
  AND keep."rankCheckId" = dup."rankCheckId"
  AND (keep."createdAt" < dup."createdAt"
    OR (keep."createdAt" = dup."createdAt" AND keep."id" < dup."id"));

ALTER TABLE "triggered_alerts" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "triggered_alerts_ruleId_keywordId_rankCheckId_key"
ON "triggered_alerts"("ruleId", "keywordId", "rankCheckId");
