-- CreateTable
CREATE TABLE "keyword_traffic_snapshots" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 28,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_traffic_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_traffic_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 28,
    "sessions" INTEGER NOT NULL,
    "visitors" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "bounceRate" DOUBLE PRECISION,
    "visitDurationSeconds" DOUBLE PRECISION,
    "keyEvents" DOUBLE PRECISION,
    "scrollDepth" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_traffic_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_traffic_snapshots_keywordId_date_idx" ON "keyword_traffic_snapshots"("keywordId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_traffic_snapshots_keyword_provider_date_window_key" ON "keyword_traffic_snapshots"("keywordId", "provider", "date", "windowDays");

-- CreateIndex
CREATE INDEX "page_traffic_snapshots_projectId_path_date_idx" ON "page_traffic_snapshots"("projectId", "path", "date");

-- CreateIndex
CREATE UNIQUE INDEX "page_traffic_snapshots_project_provider_path_date_window_key" ON "page_traffic_snapshots"("projectId", "provider", "path", "date", "windowDays");

-- AddForeignKey
ALTER TABLE "keyword_traffic_snapshots" ADD CONSTRAINT "keyword_traffic_snapshots_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_traffic_snapshots" ADD CONSTRAINT "page_traffic_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
