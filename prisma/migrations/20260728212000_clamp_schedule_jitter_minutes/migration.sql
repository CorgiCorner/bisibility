UPDATE "project_defaults"
SET "jitterMinutes" = 120
WHERE "jitterMinutes" > 120;

UPDATE "keyword_schedules"
SET "jitterMinutes" = 120
WHERE "jitterMinutes" > 120;
