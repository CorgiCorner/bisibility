-- CreateEnum
CREATE TYPE "PageSnapshotSource" AS ENUM ('sitemap', 'registry');

-- CreateTable
CREATE TABLE "page_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "takenOn" DATE NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Day 1',
    "pageCount" INTEGER NOT NULL,
    "source" "PageSnapshotSource" NOT NULL,
    "createdById" TEXT,
    "signalId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_snapshot_pages" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,

    CONSTRAINT "page_snapshot_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "page_snapshots_signalId_key" ON "page_snapshots"("signalId");

-- CreateIndex
CREATE INDEX "page_snapshots_projectId_archivedAt_idx" ON "page_snapshots"("projectId", "archivedAt");

-- One active snapshot per project. Archived rows stay for the replaced list.
CREATE UNIQUE INDEX "page_snapshots_one_active_per_project" ON "page_snapshots"("projectId") WHERE "archivedAt" IS NULL;

-- CreateIndex
CREATE INDEX "page_snapshot_pages_pageId_idx" ON "page_snapshot_pages"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "page_snapshot_pages_snapshotId_pageId_key" ON "page_snapshot_pages"("snapshotId", "pageId");

-- AddForeignKey
ALTER TABLE "page_snapshots" ADD CONSTRAINT "page_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_snapshots" ADD CONSTRAINT "page_snapshots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_snapshots" ADD CONSTRAINT "page_snapshots_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_snapshot_pages" ADD CONSTRAINT "page_snapshot_pages_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "page_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_snapshot_pages" ADD CONSTRAINT "page_snapshot_pages_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
