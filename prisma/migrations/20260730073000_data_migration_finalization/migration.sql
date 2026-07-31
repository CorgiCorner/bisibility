ALTER TABLE "data_migrations"
ADD COLUMN "runCompletedAt" TIMESTAMP(3),
ADD COLUMN "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "finalizationFailedAt" TIMESTAMP(3),
ADD COLUMN "finalizationError" TEXT;

UPDATE "data_migrations"
SET "runCompletedAt" = "finishedAt"
WHERE "finishedAt" IS NOT NULL
  AND "runCompletedAt" IS NULL;
