-- CreateEnum
CREATE TYPE "CompetitorSource" AS ENUM ('suggested', 'manual');

-- CreateEnum
CREATE TYPE "CompetitorScopePolicy" AS ENUM ('all_markets', 'selected_markets');

-- CreateEnum
CREATE TYPE "CompetitorMarketOverrideMode" AS ENUM ('added', 'excluded');

-- CreateEnum
CREATE TYPE "CompetitorSetupOutcome" AS ENUM ('confirmed', 'skipped');

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "competitorSetupOutcome" "CompetitorSetupOutcome",
ADD COLUMN "competitorSetupDecidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "competitors"
ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "source" "CompetitorSource" NOT NULL DEFAULT 'manual',
ADD COLUMN "evidence" JSONB,
ADD COLUMN "scopePolicy" "CompetitorScopePolicy" NOT NULL DEFAULT 'all_markets';

-- CreateTable
CREATE TABLE "competitor_market_overrides" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "projectMarketId" TEXT NOT NULL,
    "mode" "CompetitorMarketOverrideMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_market_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_suggestion_dismissals" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_suggestion_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitor_market_overrides_competitorId_projectMarketId_key"
ON "competitor_market_overrides"("competitorId", "projectMarketId");

-- CreateIndex
CREATE INDEX "competitor_market_overrides_projectMarketId_idx"
ON "competitor_market_overrides"("projectMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_suggestion_dismissals_projectId_domain_key"
ON "competitor_suggestion_dismissals"("projectId", "domain");

-- CreateIndex
CREATE INDEX "competitor_suggestion_dismissals_projectId_createdAt_idx"
ON "competitor_suggestion_dismissals"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "competitor_market_overrides"
ADD CONSTRAINT "competitor_market_overrides_competitorId_fkey"
FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_market_overrides"
ADD CONSTRAINT "competitor_market_overrides_projectMarketId_fkey"
FOREIGN KEY ("projectMarketId") REFERENCES "project_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_suggestion_dismissals"
ADD CONSTRAINT "competitor_suggestion_dismissals_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
