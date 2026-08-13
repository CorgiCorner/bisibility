-- AlterEnum
ALTER TYPE "ProviderCostFeature" ADD VALUE 'domain_overview';

-- CreateTable
CREATE TABLE "domain_overview_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "locationCode" INTEGER NOT NULL,
    "languageCode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "overview" JSONB NOT NULL,
    "previousOverview" JSONB,
    "history" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "previousFetchedAt" TIMESTAMP(3),
    "sourceSnapshotAt" TIMESTAMP(3),
    "previousSourceSnapshotAt" TIMESTAMP(3),
    "cachedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_overview_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_overview_snapshots_projectId_fetchedAt_idx" ON "domain_overview_snapshots"("projectId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "domain_overview_snapshot_market_key" ON "domain_overview_snapshots"("projectId", "target", "scope", "locationCode", "languageCode");

-- AddForeignKey
ALTER TABLE "domain_overview_snapshots" ADD CONSTRAINT "domain_overview_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
