-- CreateEnum
CREATE TYPE "ProjectPageSourceKind" AS ENUM ('sitemap', 'search_console', 'rank_tracker', 'ai_citation', 'manual');

-- CreateTable
CREATE TABLE "project_pages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pathHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_page_sources" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "source" "ProjectPageSourceKind" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_page_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_pages_projectId_path_idx" ON "project_pages"("projectId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "project_pages_projectId_pathHash_key" ON "project_pages"("projectId", "pathHash");

-- CreateIndex
CREATE UNIQUE INDEX "project_page_sources_pageId_source_key" ON "project_page_sources"("pageId", "source");

-- AddForeignKey
ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_page_sources" ADD CONSTRAINT "project_page_sources_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

