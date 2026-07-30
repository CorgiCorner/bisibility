-- AlterTable
ALTER TABLE "keyword_schedules" ADD COLUMN "serpDepth" INTEGER;

-- AlterTable
ALTER TABLE "project_defaults" ADD COLUMN "serpDepth" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "rank_checks" ADD COLUMN "requestedDepth" INTEGER;
