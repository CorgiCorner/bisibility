ALTER TABLE "check_schedules"
  DROP CONSTRAINT "check_schedules_archived_inactive",
  ADD CONSTRAINT "check_schedules_archived_inactive"
    CHECK ("archivedAt" IS NULL OR "enabled" = false);
