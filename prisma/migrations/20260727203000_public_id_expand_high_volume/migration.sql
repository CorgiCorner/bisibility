-- Expand-only: defer public-ID backfill and unique-index creation to the later
-- resumable Node migrator and its post-backfill operations runbook. These
-- event tables grow with checks and deliveries, so this lane stays nonunique.
ALTER TABLE "rank_checks" ADD COLUMN "publicId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "publicId" TEXT;
ALTER TABLE "triggered_alerts" ADD COLUMN "publicId" TEXT;
ALTER TABLE "notifications" ADD COLUMN "publicId" TEXT;
