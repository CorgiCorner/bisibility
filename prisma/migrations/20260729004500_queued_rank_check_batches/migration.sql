CREATE TABLE "queued_rank_check_batches" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'dataforseo',
    "priority" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "queueDeadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "ambiguousAt" TIMESTAMP(3),
    "terminalAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queued_rank_check_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "queued_rank_check_tasks" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "rankCheckId" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "state" TEXT NOT NULL,
    "costCents" DECIMAL(10,4),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queued_rank_check_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "queued_rank_check_batches_projectId_createdAt_idx"
ON "queued_rank_check_batches"("projectId", "createdAt");

CREATE INDEX "queued_rank_check_batches_state_expiresAt_idx"
ON "queued_rank_check_batches"("state", "expiresAt");

CREATE UNIQUE INDEX "queued_rank_check_tasks_rankCheckId_key"
ON "queued_rank_check_tasks"("rankCheckId");

CREATE UNIQUE INDEX "queued_rank_check_tasks_providerTaskId_key"
ON "queued_rank_check_tasks"("providerTaskId");

CREATE UNIQUE INDEX "queued_rank_check_tasks_batchId_keywordId_key"
ON "queued_rank_check_tasks"("batchId", "keywordId");

CREATE INDEX "queued_rank_check_tasks_batchId_state_idx"
ON "queued_rank_check_tasks"("batchId", "state");

ALTER TABLE "queued_rank_check_batches"
ADD CONSTRAINT "queued_rank_check_batches_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "queued_rank_check_batches"
ADD CONSTRAINT "queued_rank_check_batches_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "queued_rank_check_tasks"
ADD CONSTRAINT "queued_rank_check_tasks_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "queued_rank_check_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "queued_rank_check_tasks"
ADD CONSTRAINT "queued_rank_check_tasks_keywordId_fkey"
FOREIGN KEY ("keywordId") REFERENCES "keywords"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "queued_rank_check_tasks"
ADD CONSTRAINT "queued_rank_check_tasks_rankCheckId_fkey"
FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
