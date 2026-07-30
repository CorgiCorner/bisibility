-- AlterEnum
ALTER TYPE "ProviderCostFeature" ADD VALUE 'backlinks';

-- CreateTable
CREATE TABLE "backlink_snapshots" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetScope" TEXT NOT NULL,
    "includeSubdomains" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "fetchedRowCount" INTEGER NOT NULL,
    "totalRowsAvailable" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlink_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlink_rows" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "anchor" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "flags" TEXT[],
    "domainAuthority" INTEGER NOT NULL,
    "spamScore" DOUBLE PRECISION NOT NULL,
    "linksCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "backlink_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "backlink_snapshots_publicId_key" ON "backlink_snapshots"("publicId");

-- CreateIndex
CREATE INDEX "backlink_snapshots_projectId_target_targetScope_includeSubd_idx" ON "backlink_snapshots"("projectId", "target", "targetScope", "includeSubdomains", "fetchedAt");

-- CreateIndex
CREATE INDEX "backlink_rows_snapshotId_sourceDomain_idx" ON "backlink_rows"("snapshotId", "sourceDomain");

-- AddForeignKey
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_rows" ADD CONSTRAINT "backlink_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "backlink_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
