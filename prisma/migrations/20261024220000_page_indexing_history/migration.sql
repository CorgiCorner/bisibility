-- AlterTable
ALTER TABLE "project_defaults" ADD COLUMN     "indexingSitemapAttemptAt" TIMESTAMP(3),
ADD COLUMN     "indexingSitemapLastError" TEXT,
ADD COLUMN     "indexingSitemapLastErrorAt" TIMESTAMP(3),
ADD COLUMN     "indexingSitemapProperty" TEXT,
ADD COLUMN     "indexingSitemapReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "page_indexing_sitemaps" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentPath" TEXT,
    "isIndex" BOOLEAN NOT NULL,
    "childCount" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "isPending" BOOLEAN NOT NULL,
    "errors" INTEGER NOT NULL,
    "warnings" INTEGER NOT NULL,
    "lastSubmitted" TIMESTAMP(3),
    "lastDownloaded" TIMESTAMP(3),
    "submitted" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_indexing_sitemaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_indexing_days" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "property" TEXT,
    "indexed" INTEGER NOT NULL,
    "notIndexed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "checked" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "inspectedThatDay" INTEGER NOT NULL,
    "stop" TEXT,
    "changes" JSONB NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_indexing_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "page_indexing_sitemaps_projectId_path_key" ON "page_indexing_sitemaps"("projectId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "page_indexing_days_projectId_date_key" ON "page_indexing_days"("projectId", "date");

-- AddForeignKey
ALTER TABLE "page_indexing_sitemaps" ADD CONSTRAINT "page_indexing_sitemaps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_indexing_days" ADD CONSTRAINT "page_indexing_days_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
