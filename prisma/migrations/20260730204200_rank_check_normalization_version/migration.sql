-- Expand the observation contract while old application and worker writers may still run.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "rank_checks"
ADD COLUMN "normalizationVersion" TEXT DEFAULT 'v1';

COMMIT;
