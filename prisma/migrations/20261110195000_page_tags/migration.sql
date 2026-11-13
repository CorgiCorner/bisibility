-- CreateEnum
CREATE TYPE "PageTagOrigin" AS ENUM ('rule', 'manual');

-- CreateEnum
CREATE TYPE "TagPageRuleKind" AS ENUM ('path_pattern', 'sitemap', 'url_list', 'manual');

-- CreateTable
CREATE TABLE "page_tags" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "origin" "PageTagOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_page_rules" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "kind" "TagPageRuleKind" NOT NULL,
    "pattern" TEXT,
    "excludePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sitemapUrl" TEXT,
    "urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoJoin" BOOLEAN NOT NULL DEFAULT true,
    "tagTargetingKeywords" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "tag_page_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_tags_pageId_idx" ON "page_tags"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "page_tags_tagId_pageId_key" ON "page_tags"("tagId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "tag_page_rules_tagId_key" ON "tag_page_rules"("tagId");

-- CreateIndex
CREATE INDEX "tag_page_rules_updatedById_idx" ON "tag_page_rules"("updatedById");

-- AddForeignKey
ALTER TABLE "page_tags" ADD CONSTRAINT "page_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_tags" ADD CONSTRAINT "page_tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_page_rules" ADD CONSTRAINT "tag_page_rules_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_page_rules" ADD CONSTRAINT "tag_page_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
