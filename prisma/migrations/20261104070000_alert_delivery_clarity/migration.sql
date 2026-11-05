ALTER TABLE "triggered_alerts"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedById" TEXT,
  ADD COLUMN "acknowledgedByName" TEXT,
  ADD COLUMN "deliverySummary" JSONB;

ALTER TABLE "delivery_attempts"
  ADD COLUMN "acceptedCount" INTEGER,
  ADD COLUMN "failedCount" INTEGER,
  ADD COLUMN "unknownCount" INTEGER,
  ADD CONSTRAINT "delivery_attempts_nonnegative_counts" CHECK (
    ("acceptedCount" IS NULL AND "failedCount" IS NULL AND "unknownCount" IS NULL)
    OR ("acceptedCount" IS NOT NULL AND "failedCount" IS NOT NULL AND "unknownCount" IS NOT NULL
      AND "acceptedCount" >= 0 AND "failedCount" >= 0 AND "unknownCount" >= 0)
  );
