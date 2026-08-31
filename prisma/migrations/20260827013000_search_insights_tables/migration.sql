-- CreateTable
CREATE TABLE "search_analytics_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "date" DATE NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_analytics_query_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_query_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_analytics_page_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "date" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_page_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_analytics_query_page_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_query_page_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organic_sessions_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessions" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organic_sessions_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organic_sessions_page_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organic_sessions_page_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_analytics_imports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "state" TEXT NOT NULL,
    "pausedReason" TEXT,
    "earliestTargetDate" DATE,
    "cursorDate" DATE,
    "newestFinalizedDate" DATE,
    "finalizedThroughDate" DATE,
    "daysTotal" INTEGER NOT NULL DEFAULT 0,
    "daysDone" INTEGER NOT NULL DEFAULT 0,
    "capHitDays" INTEGER NOT NULL DEFAULT 0,
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncFinishedAt" TIMESTAMP(3),
    "lastProbeAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorClass" TEXT,
    "workflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_analytics_sync_partitions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "date" DATE NOT NULL,
    "dimensions" TEXT NOT NULL,
    "dataState" TEXT NOT NULL,
    "requestedRows" INTEGER NOT NULL,
    "returnedRows" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "capHit" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_analytics_sync_partitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_daily_partition_key" ON "search_analytics_daily"("projectId", "property", "searchType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_query_daily_partition_key" ON "search_analytics_query_daily"("projectId", "property", "searchType", "date", "keyHash");

-- Drawer reads address one key across a window.
-- CreateIndex
CREATE INDEX "search_analytics_query_daily_drawer_idx" ON "search_analytics_query_daily"("projectId", "property", "searchType", "keyHash", "date");

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_page_daily_partition_key" ON "search_analytics_page_daily"("projectId", "property", "searchType", "date", "keyHash");

-- CreateIndex
CREATE INDEX "search_analytics_page_daily_drawer_idx" ON "search_analytics_page_daily"("projectId", "property", "searchType", "keyHash", "date");

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_query_page_daily_partition_key" ON "search_analytics_query_page_daily"("projectId", "property", "searchType", "date", "keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "organic_sessions_daily_partition_key" ON "organic_sessions_daily"("projectId", "property", "date");

-- CreateIndex
CREATE UNIQUE INDEX "organic_sessions_page_daily_partition_key" ON "organic_sessions_page_daily"("projectId", "property", "date", "keyHash");

-- CreateIndex
CREATE INDEX "organic_sessions_page_daily_drawer_idx" ON "organic_sessions_page_daily"("projectId", "property", "keyHash", "date");

-- CreateIndex
CREATE INDEX "search_analytics_imports_projectId_source_idx" ON "search_analytics_imports"("projectId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_imports_partition_key" ON "search_analytics_imports"("projectId", "property", "source");

-- The trust strip reads coverage and row-ceiling facts per property across a window, across every dimension set.
-- CreateIndex
CREATE INDEX "search_analytics_sync_partitions_property_date_idx" ON "search_analytics_sync_partitions"("projectId", "property", "date");

-- CreateIndex
CREATE UNIQUE INDEX "search_analytics_sync_partition_key" ON "search_analytics_sync_partitions"("projectId", "property", "source", "searchType", "date", "dimensions", "dataState");

-- AddForeignKey
ALTER TABLE "search_analytics_daily" ADD CONSTRAINT "search_analytics_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_analytics_query_daily" ADD CONSTRAINT "search_analytics_query_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_analytics_page_daily" ADD CONSTRAINT "search_analytics_page_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_analytics_query_page_daily" ADD CONSTRAINT "search_analytics_query_page_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organic_sessions_daily" ADD CONSTRAINT "organic_sessions_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organic_sessions_page_daily" ADD CONSTRAINT "organic_sessions_page_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_analytics_imports" ADD CONSTRAINT "search_analytics_imports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_analytics_sync_partitions" ADD CONSTRAINT "search_analytics_sync_partitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
