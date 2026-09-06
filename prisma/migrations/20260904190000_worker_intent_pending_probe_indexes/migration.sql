CREATE INDEX "search_analytics_imports_pending_worker_intent_idx"
  ON "search_analytics_imports"("syncRequestedAt")
  WHERE "syncRequestedAt" IS NOT NULL
    AND "syncStartedAt" IS NULL
    AND "pausedReason" IS NULL
    AND "source" = 'gsc'
    AND "state" NOT IN ('queued', 'running');

CREATE INDEX "provider_connections_pending_worker_intent_idx"
  ON "provider_connections"("firstSyncStartedAt")
  WHERE "kind" = 'analytics'
    AND "enabled" = true
    AND "status" = 'connected'
    AND "firstSyncRequestedAt" IS NOT NULL
    AND "firstSyncFinishedAt" IS NULL;

CREATE INDEX "users_pending_welcome_worker_intent_idx"
  ON "users"("welcomeFollowupStartedAt")
  WHERE "welcomeFollowupRequestedAt" IS NOT NULL
    AND "welcomeFollowupFinishedAt" IS NULL
    AND "welcomeFollowupExpiredAt" IS NULL;
