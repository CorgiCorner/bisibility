-- Expand-only: nullable public IDs are filled by a later resumable Node migrator.
-- This low-volume lane can enforce uniqueness while values remain nullable.
ALTER TABLE "users" ADD COLUMN "publicId" TEXT;
ALTER TABLE "sessions" ADD COLUMN "publicId" TEXT;
ALTER TABLE "projects" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memberships" ADD COLUMN "publicId" TEXT;
ALTER TABLE "tags" ADD COLUMN "publicId" TEXT;
ALTER TABLE "competitors" ADD COLUMN "publicId" TEXT;
ALTER TABLE "provider_connections" ADD COLUMN "publicId" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "publicId" TEXT;
ALTER TABLE "personal_access_tokens" ADD COLUMN "publicId" TEXT;
ALTER TABLE "alert_rules" ADD COLUMN "publicId" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "publicId" TEXT;
ALTER TABLE "saved_views" ADD COLUMN "publicId" TEXT;
ALTER TABLE "invites" ADD COLUMN "publicId" TEXT;
ALTER TABLE "migration_tokens" ADD COLUMN "publicId" TEXT;
ALTER TABLE "cloud_import_jobs" ADD COLUMN "publicId" TEXT;

CREATE UNIQUE INDEX "users_publicId_key" ON "users"("publicId");
CREATE UNIQUE INDEX "sessions_publicId_key" ON "sessions"("publicId");
CREATE UNIQUE INDEX "memberships_publicId_key" ON "memberships"("publicId");
CREATE UNIQUE INDEX "tags_publicId_key" ON "tags"("publicId");
CREATE UNIQUE INDEX "competitors_publicId_key" ON "competitors"("publicId");
CREATE UNIQUE INDEX "provider_connections_publicId_key" ON "provider_connections"("publicId");
CREATE UNIQUE INDEX "api_keys_publicId_key" ON "api_keys"("publicId");
CREATE UNIQUE INDEX "personal_access_tokens_publicId_key" ON "personal_access_tokens"("publicId");
CREATE UNIQUE INDEX "alert_rules_publicId_key" ON "alert_rules"("publicId");
CREATE UNIQUE INDEX "webhook_endpoints_publicId_key" ON "webhook_endpoints"("publicId");
CREATE UNIQUE INDEX "saved_views_publicId_key" ON "saved_views"("publicId");
CREATE UNIQUE INDEX "invites_publicId_key" ON "invites"("publicId");
CREATE UNIQUE INDEX "migration_tokens_publicId_key" ON "migration_tokens"("publicId");
CREATE UNIQUE INDEX "cloud_import_jobs_publicId_key" ON "cloud_import_jobs"("publicId");

-- Temporary ledger for the later resumable Node public-ID rewrite. It has no
-- foreign keys because it maps rows across independently migrated tables.
CREATE TYPE "PublicIdEntityType" AS ENUM (
    'user',
    'session',
    'membership',
    'project',
    'keyword',
    'saved_keyword',
    'tag',
    'competitor',
    'rank_check',
    'provider_connection',
    'api_key',
    'personal_access_token',
    'audit_log',
    'alert_rule',
    'triggered_alert',
    'webhook_endpoint',
    'saved_view',
    'notification',
    'invite',
    'migration_token',
    'cloud_import_job',
    'ingest_hook',
    'signal'
);

CREATE TABLE "public_id_migrations" (
    "id" TEXT NOT NULL,
    "entityType" "PublicIdEntityType" NOT NULL,
    "internalId" TEXT NOT NULL,
    "oldExternalId" TEXT,
    "newPublicId" TEXT NOT NULL,
    "migratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_id_migrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_id_migrations_entityType_internalId_key"
ON "public_id_migrations"("entityType", "internalId");

CREATE UNIQUE INDEX "public_id_migrations_entityType_oldExternalId_key"
ON "public_id_migrations"("entityType", "oldExternalId");

CREATE UNIQUE INDEX "public_id_migrations_newPublicId_key"
ON "public_id_migrations"("newPublicId");

CREATE INDEX "public_id_migrations_entityType_migratedAt_idx"
ON "public_id_migrations"("entityType", "migratedAt");
