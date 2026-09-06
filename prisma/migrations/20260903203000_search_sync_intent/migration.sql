ALTER TABLE "search_analytics_imports"
ADD COLUMN "syncRequestedAt" TIMESTAMP(3),
ADD COLUMN "syncStartedAt" TIMESTAMP(3);

CREATE INDEX "search_analytics_imports_sync_intent_idx"
ON "search_analytics_imports"("syncRequestedAt", "syncStartedAt");
