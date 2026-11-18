-- Additive native own-key persistence. Enum values are committed by the preceding migration.
-- CreateTable
CREATE TABLE "model_playground_previews" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_playground_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_playground_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_playground_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_playground_columns" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "liveConnectionId" TEXT,
    "liveConnectionProjectId" TEXT,
    "providerId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "operationKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "dispatchStartedAt" TIMESTAMP(3),
    "result" JSONB,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "model_playground_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_playground_presets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_playground_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_playground_previews_projectId_createdAt_idx" ON "model_playground_previews"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_previews_projectId_id_key" ON "model_playground_previews"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_runs_reportId_key" ON "model_playground_runs"("reportId");

-- CreateIndex
CREATE INDEX "model_playground_runs_projectId_createdAt_id_idx" ON "model_playground_runs"("projectId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_runs_projectId_id_key" ON "model_playground_runs"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_runs_projectId_requestId_key" ON "model_playground_runs"("projectId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_runs_projectId_reportId_key" ON "model_playground_runs"("projectId", "reportId");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_columns_operationKey_key" ON "model_playground_columns"("operationKey");

-- CreateIndex
CREATE INDEX "model_playground_columns_projectId_state_leaseExpiresAt_idx" ON "model_playground_columns"("projectId", "state", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "model_playground_columns_live_connection_idx" ON "model_playground_columns"("liveConnectionProjectId", "liveConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_columns_runId_columnId_key" ON "model_playground_columns"("runId", "columnId");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_presets_runId_key" ON "model_playground_presets"("runId");

-- CreateIndex
CREATE INDEX "model_playground_presets_projectId_promptId_idx" ON "model_playground_presets"("projectId", "promptId");

-- CreateIndex
CREATE UNIQUE INDEX "model_playground_presets_projectId_runId_key" ON "model_playground_presets"("projectId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_reports_project_id_model_unique" ON "agent_reports"("projectId", "id");

-- AddForeignKey
ALTER TABLE "model_playground_previews" ADD CONSTRAINT "model_playground_previews_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_runs" ADD CONSTRAINT "model_playground_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_runs" ADD CONSTRAINT "model_playground_runs_projectId_previewId_fkey" FOREIGN KEY ("projectId", "previewId") REFERENCES "model_playground_previews"("projectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "model_playground_runs" ADD CONSTRAINT "model_playground_runs_projectId_reportId_fkey" FOREIGN KEY ("projectId", "reportId") REFERENCES "agent_reports"("projectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "model_playground_columns" ADD CONSTRAINT "model_playground_columns_projectId_runId_fkey" FOREIGN KEY ("projectId", "runId") REFERENCES "model_playground_runs"("projectId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_columns" ADD CONSTRAINT "model_playground_columns_live_connection_fkey" FOREIGN KEY ("liveConnectionProjectId", "liveConnectionId") REFERENCES "provider_connections"("projectId", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_presets" ADD CONSTRAINT "model_playground_presets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_presets" ADD CONSTRAINT "model_playground_presets_projectId_runId_fkey" FOREIGN KEY ("projectId", "runId") REFERENCES "model_playground_runs"("projectId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_playground_presets" ADD CONSTRAINT "model_playground_presets_projectId_promptId_fkey" FOREIGN KEY ("projectId", "promptId") REFERENCES "ai_prompts"("projectId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
