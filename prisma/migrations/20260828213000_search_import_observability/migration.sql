ALTER TABLE "search_analytics_imports"
ADD COLUMN "plannedRetentionMonths" INTEGER;

ALTER TABLE "search_analytics_request_usage"
ADD COLUMN "dataState" TEXT NOT NULL DEFAULT 'final',
ADD COLUMN "searchType" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'gsc',
ADD COLUMN "persistedAt" TIMESTAMP(3);
