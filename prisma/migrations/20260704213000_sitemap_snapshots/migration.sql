-- CreateTable
CREATE TABLE "sitemap_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sitemapUrl" TEXT NOT NULL,
    "urlCount" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sitemap_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sitemap_snapshots_projectId_fetchedAt_idx" ON "sitemap_snapshots"("projectId", "fetchedAt" DESC);

-- AddForeignKey
ALTER TABLE "sitemap_snapshots" ADD CONSTRAINT "sitemap_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
