ALTER TABLE "search_analytics_request_usage"
  ADD COLUMN IF NOT EXISTS "dimensions" TEXT,
  ADD COLUMN IF NOT EXISTS "startDate" DATE,
  ADD COLUMN IF NOT EXISTS "endDate" DATE,
  ADD COLUMN IF NOT EXISTS "startRow" INTEGER,
  ADD COLUMN IF NOT EXISTS "rowLimit" INTEGER,
  ADD COLUMN IF NOT EXISTS "returnedRows" INTEGER,
  ADD COLUMN IF NOT EXISTS "capHit" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "dataState" TEXT,
  ADD COLUMN IF NOT EXISTS "searchType" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "persistedAt" TIMESTAMP(3);

-- Rows missing foundational request provenance predate the rich ledger. Keep their exact
-- request-count history, but make them incapable of proving aggregate readiness.
UPDATE "search_analytics_request_usage"
SET
  "dimensions" = COALESCE("dimensions", ''),
  "startDate" = COALESCE("startDate", "attemptedAt"::date),
  "endDate" = COALESCE("endDate", "attemptedAt"::date),
  "startRow" = COALESCE("startRow", 0),
  "rowLimit" = COALESCE("rowLimit", 0),
  "dataState" = 'legacy',
  "searchType" = '',
  "source" = '',
  "persistedAt" = NULL
WHERE
  "dimensions" IS NULL
  OR "startDate" IS NULL
  OR "endDate" IS NULL
  OR "startRow" IS NULL
  OR "rowLimit" IS NULL;

ALTER TABLE "search_analytics_request_usage"
  ALTER COLUMN "dimensions" SET NOT NULL,
  ALTER COLUMN "startDate" SET NOT NULL,
  ALTER COLUMN "endDate" SET NOT NULL,
  ALTER COLUMN "startRow" SET NOT NULL,
  ALTER COLUMN "rowLimit" SET NOT NULL,
  ALTER COLUMN "dataState" SET NOT NULL,
  ALTER COLUMN "searchType" SET NOT NULL,
  ALTER COLUMN "source" SET NOT NULL,
  ALTER COLUMN "dataState" DROP DEFAULT,
  ALTER COLUMN "searchType" DROP DEFAULT,
  ALTER COLUMN "source" DROP DEFAULT;
