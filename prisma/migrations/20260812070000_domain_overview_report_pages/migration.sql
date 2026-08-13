-- AlterTable
ALTER TABLE "domain_overview_snapshots"
ADD COLUMN "rankedKeywords" JSONB,
ADD COLUMN "relevantPages" JSONB;
