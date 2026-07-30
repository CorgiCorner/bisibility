-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'urgent');

-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN "severity" "AlertSeverity";

UPDATE "alert_rules"
SET "severity" = CASE
  WHEN "conditionType" IN ('enters_top_n', 'serp_feature') THEN 'info'::"AlertSeverity"
  WHEN "conditionType" IN ('threshold', 'exits_top_n', 'url_mismatch') THEN 'urgent'::"AlertSeverity"
  ELSE 'warning'::"AlertSeverity"
END;

ALTER TABLE "alert_rules" ALTER COLUMN "severity" SET NOT NULL;
