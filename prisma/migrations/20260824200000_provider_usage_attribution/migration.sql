ALTER TABLE "provider_cost_entries"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "keywordId" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "trigger" TEXT,
  ADD COLUMN "tag" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "providerRequestId" TEXT;

CREATE INDEX "provider_cost_entries_projectId_correlationId_idx"
  ON "provider_cost_entries"("projectId", "correlationId");

CREATE INDEX "provider_cost_entries_provider_providerRequestId_idx"
  ON "provider_cost_entries"("provider", "providerRequestId");

ALTER TABLE "queued_rank_check_tasks"
  ADD COLUMN "providerTag" TEXT;
