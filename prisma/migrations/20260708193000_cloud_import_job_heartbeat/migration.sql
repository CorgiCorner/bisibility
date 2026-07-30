-- Add heartbeat timestamps for reclaiming stalled single-shot import jobs.
ALTER TABLE "cloud_import_jobs"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "cloud_import_jobs_state_updatedAt_idx"
ON "cloud_import_jobs"("state", "updatedAt");

CREATE INDEX "cloud_import_jobs_finishedAt_idx"
ON "cloud_import_jobs"("finishedAt");
