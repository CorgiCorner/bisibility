-- Rank-check in-app notifications become opt-in for NEW preference rows.
-- Existing rows are kept as-is: explicit opt-ins are indistinguishable from
-- the old default and must not be destroyed.
ALTER TABLE "notification_preferences" ALTER COLUMN "checkInApp" SET DEFAULT false;

-- Dedicated, indexed idempotency key replaces the unindexed payload JSON path dedup.
ALTER TABLE "notifications" ADD COLUMN "idempotencyKey" TEXT;

UPDATE "notifications"
SET "idempotencyKey" = "payload"->>'idempotencyKey'
WHERE "payload" IS NOT NULL
  AND jsonb_typeof("payload"->'idempotencyKey') = 'string';

-- Remove duplicates left behind by the race-prone find-then-create dedup,
-- keeping the earliest row, so the unique index can be created.
DELETE FROM "notifications" a
USING "notifications" b
WHERE a."idempotencyKey" IS NOT NULL
  AND b."userId" = a."userId"
  AND b."idempotencyKey" = a."idempotencyKey"
  AND (b."createdAt" < a."createdAt"
       OR (b."createdAt" = a."createdAt" AND b."id" < a."id"));

CREATE UNIQUE INDEX "notifications_userId_idempotencyKey_key"
  ON "notifications"("userId", "idempotencyKey");
