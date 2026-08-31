ALTER TABLE "project_defaults"
  ADD COLUMN "searchSyncImportMonths" INTEGER,
  ADD COLUMN "searchSyncPace" TEXT;

ALTER TABLE "search_analytics_imports"
  ADD COLUMN "lastQuotaPausedAt" TIMESTAMP(3);

CREATE TABLE "search_analytics_request_usage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "property" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "dimensions" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "startRow" INTEGER NOT NULL,
  "rowLimit" INTEGER NOT NULL,
  "returnedRows" INTEGER,
  "capHit" BOOLEAN,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_analytics_request_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_analytics_request_usage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "search_analytics_request_usage_quota_idx" ON "search_analytics_request_usage"("projectId", "property", "attemptedAt");
