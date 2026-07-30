-- Release N prerequisite for the public ID v3 cutover.
-- The application and Temporal worker must remain quiesced until the blocking
-- data migration has rewritten every public ID and installed the v3 checks.

CREATE TABLE "public_id_v3_migrations" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "oldExternalId" TEXT,
    "newPublicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "migratedAt" TIMESTAMP(3),

    CONSTRAINT "public_id_v3_migrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_id_v3_migrations_entityType_internalId_key"
ON "public_id_v3_migrations"("entityType", "internalId");

CREATE UNIQUE INDEX "public_id_v3_migrations_entityType_oldExternalId_key"
ON "public_id_v3_migrations"("entityType", "oldExternalId");

CREATE UNIQUE INDEX "public_id_v3_migrations_newPublicId_key"
ON "public_id_v3_migrations"("newPublicId");

CREATE INDEX "public_id_v3_migrations_entityType_migratedAt_idx"
ON "public_id_v3_migrations"("entityType", "migratedAt");

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'sessions', 'memberships', 'projects', 'keywords',
    'saved_keywords', 'tags', 'competitors', 'rank_checks',
    'provider_connections', 'api_keys', 'personal_access_tokens',
    'audit_logs', 'alert_rules', 'triggered_alerts', 'webhook_endpoints',
    'saved_views', 'notifications', 'invites', 'migration_tokens',
    'cloud_import_jobs', 'ingest_hooks', 'signals'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      table_name,
      table_name || '_public_id_contract_format'
    );
  END LOOP;
END
$$;
