ALTER TABLE "search_analytics_imports"
  ADD COLUMN "pauseStartedAt" TIMESTAMP(3),
  ADD COLUMN "pausedById" TEXT;

CREATE INDEX "search_analytics_imports_pausedById_idx"
  ON "search_analytics_imports"("pausedById");

ALTER TABLE "search_analytics_imports"
  ADD CONSTRAINT "search_analytics_imports_pausedById_fkey"
  FOREIGN KEY ("pausedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
