ALTER TABLE "check_schedules" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "check_schedules" ADD CONSTRAINT "check_schedules_archived_inactive"
  CHECK ("archivedAt" IS NULL OR ("enabled" = false AND "isDefault" = false));
CREATE INDEX "check_schedules_projectId_archivedAt_idx" ON "check_schedules"("projectId", "archivedAt");
