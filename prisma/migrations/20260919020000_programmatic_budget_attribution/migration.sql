ALTER TABLE "provider_cost_entries"
ADD COLUMN "credentialKind" VARCHAR(16),
ADD COLUMN "credentialId" VARCHAR(128);

ALTER TABLE "queued_rank_check_batches"
ADD COLUMN "source" TEXT,
ADD COLUMN "trigger" TEXT,
ADD COLUMN "credentialKind" TEXT,
ADD COLUMN "credentialId" TEXT;

ALTER TABLE "rank_check_runs"
ADD COLUMN "source" TEXT,
ADD COLUMN "credentialKind" TEXT,
ADD COLUMN "credentialId" TEXT;

-- CreateIndex
CREATE INDEX "provider_cost_entries_connectionId_source_createdAt_idx" ON "provider_cost_entries"("connectionId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "provider_cost_entries_credential_idx" ON "provider_cost_entries"("projectId", "credentialKind", "credentialId", "createdAt");
