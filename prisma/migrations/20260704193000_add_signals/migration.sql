-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('rank_tracker', 'search_analytics', 'url_inspection', 'sitemap', 'deploy', 'cms', 'search_engine_status', 'manual', 'api');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keywordId" TEXT,
    "source" "SignalSource" NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'info',
    "url" TEXT,
    "payload" JSONB,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signals_publicId_key" ON "signals"("publicId");

-- CreateIndex
CREATE INDEX "signals_projectId_happenedAt_idx" ON "signals"("projectId", "happenedAt" DESC);

-- CreateIndex
CREATE INDEX "signals_projectId_source_happenedAt_idx" ON "signals"("projectId", "source", "happenedAt");

-- CreateIndex
CREATE INDEX "signals_keywordId_happenedAt_idx" ON "signals"("keywordId", "happenedAt");

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
