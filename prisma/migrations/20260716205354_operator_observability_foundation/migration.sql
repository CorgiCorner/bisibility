-- AlterTable
ALTER TABLE "rank_checks"
ADD COLUMN "trigger" TEXT,
ADD COLUMN "scheduleId" TEXT,
ADD COLUMN "workflowRunId" TEXT,
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "finishedAt" TIMESTAMP(3),
ADD COLUMN "deferredReason" TEXT;

-- CreateTable
CREATE TABLE "operational_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT,
    "connectionId" TEXT,
    "provider" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "operational_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fields" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operational_runs_kind_startedAt_idx" ON "operational_runs"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "operational_runs_projectId_provider_startedAt_idx" ON "operational_runs"("projectId", "provider", "startedAt");

-- CreateIndex
CREATE INDEX "ops_events_deliveredAt_createdAt_idx" ON "ops_events"("deliveredAt", "createdAt");
