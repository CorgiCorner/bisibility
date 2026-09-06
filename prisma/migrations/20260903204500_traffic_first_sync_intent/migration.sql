ALTER TABLE "provider_connections"
ADD COLUMN "firstSyncRequestedAt" TIMESTAMP(3),
ADD COLUMN "firstSyncStartedAt" TIMESTAMP(3),
ADD COLUMN "firstSyncFinishedAt" TIMESTAMP(3);

CREATE INDEX "provider_connections_first_sync_intent_idx"
ON "provider_connections"(
  "kind",
  "firstSyncFinishedAt",
  "firstSyncStartedAt",
  "firstSyncRequestedAt"
);
