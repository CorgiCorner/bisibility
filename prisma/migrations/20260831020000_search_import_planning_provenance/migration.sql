ALTER TABLE "search_analytics_imports"
  ADD COLUMN "firstDataDate" DATE,
  ADD COLUMN "firstDataDetectedAt" TIMESTAMP(3),
  ADD COLUMN "historyBoundarySource" TEXT,
  ADD COLUMN "waitingForFirstDataAt" TIMESTAMP(3);

ALTER TABLE "search_analytics_request_usage"
  ADD COLUMN "failureClass" TEXT;
