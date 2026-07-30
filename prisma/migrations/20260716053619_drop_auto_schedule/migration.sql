/*
  Warnings:

  - You are about to drop the `autoSchedule` column on the `keyword_schedules` table. All data in the column will be lost.
  - You are about to drop the `autoSchedule` column on the `project_defaults` table. All data in the column will be lost.

*/
-- Preserve intentionally disabled automatic schedules before removing the legacy flag.
UPDATE "keyword_schedules"
SET "frequency" = 'paused'
WHERE "autoSchedule" = false
  AND "frequency" NOT IN ('manual', 'paused');

UPDATE "project_defaults"
SET "frequency" = 'paused'
WHERE "autoSchedule" = false
  AND "frequency" NOT IN ('manual', 'paused');

-- AlterTable
ALTER TABLE "keyword_schedules" DROP COLUMN "autoSchedule";

-- AlterTable
ALTER TABLE "project_defaults" DROP COLUMN "autoSchedule";
