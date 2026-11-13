-- CreateEnum
CREATE TYPE "PageVitalsStrategy" AS ENUM ('mobile', 'desktop');

-- CreateEnum
CREATE TYPE "PageVitalsSource" AS ENUM ('field', 'origin', 'lab');

-- CreateEnum
CREATE TYPE "PageVitalsStatus" AS ENUM ('good', 'needs_improvement', 'poor', 'unknown');

-- CreateTable
CREATE TABLE "page_vitals" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "strategy" "PageVitalsStrategy" NOT NULL,
    "source" "PageVitalsSource" NOT NULL,
    "lcpMs" INTEGER NOT NULL,
    "inpMs" INTEGER,
    "cls" DECIMAL(6,4) NOT NULL,
    "status" "PageVitalsStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_vitals_projectId_idx" ON "page_vitals"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "page_vitals_pageId_strategy_key" ON "page_vitals"("pageId", "strategy");

-- AddForeignKey
ALTER TABLE "page_vitals" ADD CONSTRAINT "page_vitals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_vitals" ADD CONSTRAINT "page_vitals_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "project_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
