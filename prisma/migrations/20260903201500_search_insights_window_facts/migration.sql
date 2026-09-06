-- Window aggregates computed once by the import instead of on every render. The import is the
-- only writer; a render reads, and on a miss computes live without writing.
--
-- Staleness is a flag rather than a property of the key: a backfill that fills a gap inside an
-- already-computed window changes the numbers while `finalizedThrough` stands still.
CREATE TABLE "search_insights_window_facts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "windowDays" INTEGER NOT NULL,
    "finalizedThrough" DATE NOT NULL,
    "importId" TEXT NOT NULL,
    "coveredDays" INTEGER NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "coverage" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "defaultLensQueries" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_insights_window_facts_pkey" PRIMARY KEY ("id")
);

-- The compared window is its own row: same windowDays, finalizedThrough one day before this
-- row's window starts.
CREATE UNIQUE INDEX "search_insights_window_facts_key" ON "search_insights_window_facts"("projectId", "property", "searchType", "windowDays", "finalizedThrough");

-- Supports marking a property's rows stale across a span without scanning the table.
CREATE INDEX "search_insights_window_facts_sweep_idx" ON "search_insights_window_facts"("projectId", "property", "finalizedThrough");

-- Supports the import finding what it has to recompute.
CREATE INDEX "search_insights_window_facts_stale_idx" ON "search_insights_window_facts"("projectId", "property", "stale");

ALTER TABLE "search_insights_window_facts" ADD CONSTRAINT "search_insights_window_facts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
