ALTER TYPE "AlertConditionType" ADD VALUE 'position_drop';
ALTER TYPE "AlertConditionType" ADD VALUE 'downtrend';
ALTER TABLE "alert_rules" ADD COLUMN "dropPositions" INTEGER;
