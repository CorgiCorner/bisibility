UPDATE "queued_rank_check_tasks"
SET "state" = 'ready'
WHERE "state" = 'persisting';

ALTER TABLE "queued_rank_check_tasks"
ADD COLUMN "persistenceLeaseOwner" TEXT,
ADD COLUMN "persistenceLeaseExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "queued_rank_check_tasks_persistenceLeaseOwner_key"
ON "queued_rank_check_tasks"("persistenceLeaseOwner");
