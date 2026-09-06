-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "checkScheduleId" TEXT;

-- AlterTable
ALTER TABLE "rank_checks" ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "queued_rank_check_batches" ADD COLUMN     "runId" TEXT;

-- CreateTable
CREATE TABLE "check_schedules" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "RankCheckFrequency" NOT NULL,
    "cronExpression" TEXT,
    "timeOfDay" TEXT,
    "timezone" TEXT,
    "jitterMinutes" INTEGER NOT NULL DEFAULT 60,
    "serpDepth" INTEGER,
    "providerPolicy" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_check_runs" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "selectionKind" TEXT NOT NULL,
    "selectionSpec" JSONB NOT NULL,
    "selectionHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "outcome" TEXT,
    "blockedReason" TEXT,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "deferredCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "keywordCount" INTEGER NOT NULL DEFAULT 0,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "checkScheduleId" TEXT,
    "plannedFor" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "parentRunId" TEXT,
    "parentRelation" TEXT,
    "orchestrationWorkflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_check_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_check_run_items" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "blockedReason" TEXT,
    "notBefore" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "claimAttempts" INTEGER NOT NULL DEFAULT 0,
    "rankCheckId" TEXT,
    "sourceRunItemId" TEXT,
    "estimatedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_check_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "check_schedules_publicId_key" ON "check_schedules"("publicId");

-- CreateIndex
CREATE INDEX "check_schedules_projectId_idx" ON "check_schedules"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_runs_publicId_key" ON "rank_check_runs"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_runs_orchestrationWorkflowId_key" ON "rank_check_runs"("orchestrationWorkflowId");

-- CreateIndex
CREATE INDEX "rank_check_runs_projectId_startedAt_id_idx" ON "rank_check_runs"("projectId", "startedAt", "id");

-- CreateIndex
CREATE INDEX "rank_check_runs_projectId_status_idx" ON "rank_check_runs"("projectId", "status");

-- CreateIndex
CREATE INDEX "rank_check_runs_checkScheduleId_plannedFor_idx" ON "rank_check_runs"("checkScheduleId", "plannedFor");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_runs_projectId_idempotencyKey_key" ON "rank_check_runs"("projectId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_run_items_rankCheckId_key" ON "rank_check_run_items"("rankCheckId");

-- CreateIndex
CREATE INDEX "rank_check_run_items_runId_status_idx" ON "rank_check_run_items"("runId", "status");

-- CreateIndex
CREATE INDEX "rank_check_run_items_keywordId_idx" ON "rank_check_run_items"("keywordId");

-- CreateIndex
CREATE INDEX "rank_check_run_items_status_notBefore_idx" ON "rank_check_run_items"("status", "notBefore");

-- CreateIndex
CREATE UNIQUE INDEX "rank_check_run_items_runId_keywordId_key" ON "rank_check_run_items"("runId", "keywordId");

-- CreateIndex
CREATE INDEX "keywords_checkScheduleId_idx" ON "keywords"("checkScheduleId");

-- CreateIndex
CREATE INDEX "rank_checks_runId_idx" ON "rank_checks"("runId");

-- CreateIndex
CREATE INDEX "queued_rank_check_batches_runId_idx" ON "queued_rank_check_batches"("runId");

-- AddCheckConstraint
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_public_id_contract_format" CHECK ("publicId" ~ '^rcr_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "check_schedules" ADD CONSTRAINT "check_schedules_public_id_contract_format" CHECK ("publicId" ~ '^sch_[a-z][a-z0-9]{23}$'::text);

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_checkScheduleId_fkey" FOREIGN KEY ("checkScheduleId") REFERENCES "check_schedules"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "check_schedules" ADD CONSTRAINT "check_schedules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_checks" ADD CONSTRAINT "rank_checks_runId_fkey" FOREIGN KEY ("runId") REFERENCES "rank_check_runs"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_checkScheduleId_fkey" FOREIGN KEY ("checkScheduleId") REFERENCES "check_schedules"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "rank_check_runs"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rank_check_run_items" ADD CONSTRAINT "rank_check_run_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES "rank_check_runs"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check_run_items" ADD CONSTRAINT "rank_check_run_items_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_check_run_items" ADD CONSTRAINT "rank_check_run_items_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rank_check_run_items" ADD CONSTRAINT "rank_check_run_items_sourceRunItemId_fkey" FOREIGN KEY ("sourceRunItemId") REFERENCES "rank_check_run_items"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "queued_rank_check_batches" ADD CONSTRAINT "queued_rank_check_batches_runId_fkey" FOREIGN KEY ("runId") REFERENCES "rank_check_runs"("id") ON DELETE SET NULL;

-- Enforce one default schedule per project.
CREATE UNIQUE INDEX "check_schedules_one_default_per_project" ON "check_schedules" ("projectId") WHERE "isDefault" = true;
