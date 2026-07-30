-- data-migration-contract: self-guarding
-- Release N+1 keeps the write gate and reservation ledger until operator cleanup.
-- SET lock_timeout remains scoped to this transaction through SET LOCAL below.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  gate_phase TEXT;
  gate_blocked BOOLEAN;
  spec RECORD;
  constraint_definition TEXT;
  constraint_validated BOOLEAN;
  duplicate_public_id TEXT;
  index_exists BOOLEAN;
  index_matches BOOLEAN;
  invalid_rows BIGINT;
  ledger_mismatches BIGINT;
  pattern TEXT;
  total_rows BIGINT := 0;
BEGIN
  IF to_regclass(
    format('%I.public_id_v3_write_gate', current_schema())
  ) IS NULL THEN
    RAISE EXCEPTION 'Public ID v3 N+1 requires the write gate installed by release N.';
  END IF;
  IF to_regclass(
    format('%I.public_id_v3_migrations', current_schema())
  ) IS NULL THEN
    RAISE EXCEPTION 'Public ID v3 N+1 requires the release N reservation ledger.';
  END IF;

  FOR spec IN
    SELECT table_meta.schemaname, table_meta.tablename
      FROM pg_catalog.pg_tables AS table_meta
     WHERE table_meta.schemaname = current_schema()
       AND table_meta.tablename NOT IN (
         '_prisma_migrations',
         'data_migrations',
         'public_id_v3_write_gate'
       )
     ORDER BY table_meta.tablename
  LOOP
    EXECUTE format(
      'LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',
      spec.schemaname,
      spec.tablename
    );
  END LOOP;
  LOCK TABLE "data_migrations" IN SHARE ROW EXCLUSIVE MODE;

  FOR spec IN
    SELECT table_meta.schemaname, table_meta.tablename
      FROM pg_catalog.pg_tables AS table_meta
     WHERE table_meta.schemaname = current_schema()
       AND table_meta.tablename NOT IN (
         '_prisma_migrations',
         'data_migrations',
         'public_id_v3_write_gate'
       )
     ORDER BY table_meta.tablename
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_meta
        JOIN pg_catalog.pg_class AS trigger_table
          ON trigger_table.oid = trigger_meta.tgrelid
        JOIN pg_catalog.pg_namespace AS trigger_namespace
          ON trigger_namespace.oid = trigger_table.relnamespace
       WHERE trigger_namespace.nspname = spec.schemaname
         AND trigger_table.relname = spec.tablename
         AND NOT trigger_meta.tgisinternal
         AND trigger_meta.tgname = 'public_id_v3_write_gate'
         AND trigger_meta.tgtype = 62
         AND trigger_meta.tgfoid = to_regprocedure(
           format(
             '%I.enforce_public_id_v3_write_gate()',
             current_schema()
           )
         )
    ) THEN
      RAISE EXCEPTION
        'Public ID v3 write gate trigger is missing or invalid for %.',
        spec.tablename;
    END IF;
  END LOOP;

  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users'), ('sessions'), ('memberships'), ('projects'), ('keywords'),
        ('saved_keywords'), ('tags'), ('competitors'), ('rank_checks'),
        ('provider_connections'), ('api_keys'), ('personal_access_tokens'),
        ('audit_logs'), ('alert_rules'), ('triggered_alerts'), ('webhook_endpoints'),
        ('saved_views'), ('notifications'), ('invites'), ('migration_tokens'),
        ('cloud_import_jobs'), ('ingest_hooks'), ('signals')
      ) AS required(table_name)
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', spec.table_name) INTO invalid_rows;
    total_rows := total_rows + invalid_rows;
  END LOOP;

  SELECT "phase", "writesBlocked"
    INTO STRICT gate_phase, gate_blocked
    FROM "public_id_v3_write_gate"
   WHERE "id" IS TRUE
   FOR UPDATE;
  IF gate_blocked IS NOT TRUE
     OR gate_phase NOT IN ('public-id-v3-n', 'public-id-v3-n1') THEN
    RAISE EXCEPTION
      'Public ID v3 N+1 requires a blocked release N+1 write gate.';
  END IF;
  IF gate_phase = 'public-id-v3-n' THEN
    IF total_rows <> 0 THEN
      RAISE EXCEPTION
        'Only an empty fresh database may enter N+1 from a blocked release N gate.';
    END IF;
    UPDATE "public_id_v3_write_gate"
       SET "phase" = 'public-id-v3-n1',
           "releasedAt" = NULL,
           "releasedAppRelease" = NULL,
           "updatedAt" = NOW()
     WHERE "id" IS TRUE
       AND "phase" = 'public-id-v3-n'
       AND "releasePolicy" = 'automatic'
       AND "targetAppRelease" =
           '0000000000000000000000000000000000000000'
       AND "writesBlocked" IS TRUE
       AND "releasedAt" IS NULL
       AND "releasedAppRelease" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Fresh public ID v3 N+1 requires the initial automatic release N gate.';
    END IF;
    gate_phase := 'public-id-v3-n1';
  END IF;

  IF total_rows <> 0 AND NOT EXISTS (
    SELECT 1
      FROM "data_migrations"
     WHERE "id" = '20260729213000_public_id_v3_cutover'
       AND "checksum" =
           '396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a'
       AND "finishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Public ID v3 release N data migration audit is incomplete or mismatched.';
  END IF;

  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users', 'user', 'usr'),
        ('sessions', 'session', 'sid'),
        ('memberships', 'membership', 'mbr'),
        ('projects', 'project', 'prj'),
        ('keywords', 'keyword', 'kw'),
        ('saved_keywords', 'saved_keyword', 'svkw'),
        ('tags', 'tag', 'tag'),
        ('competitors', 'competitor', 'cmp'),
        ('rank_checks', 'rank_check', 'check'),
        ('provider_connections', 'provider_connection', 'conn'),
        ('api_keys', 'api_key', 'key'),
        ('personal_access_tokens', 'personal_access_token', 'pat'),
        ('audit_logs', 'audit_log', 'audit'),
        ('alert_rules', 'alert_rule', 'alr'),
        ('triggered_alerts', 'triggered_alert', 'al'),
        ('webhook_endpoints', 'webhook_endpoint', 'we'),
        ('saved_views', 'saved_view', 'viw'),
        ('notifications', 'notification', 'ntf'),
        ('invites', 'invite', 'inv'),
        ('migration_tokens', 'migration_token', 'ferry'),
        ('cloud_import_jobs', 'cloud_import_job', 'imp'),
        ('ingest_hooks', 'ingest_hook', 'dwh'),
        ('signals', 'signal', 'sig')
      ) AS required(table_name, entity_type, prefix)
  LOOP
    pattern := format('^%s_[a-z][a-z0-9]{23}$', spec.prefix);
    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE "publicId" IS NULL OR "publicId" !~ %L',
      spec.table_name,
      pattern
    ) INTO invalid_rows;
    IF invalid_rows <> 0 THEN
      RAISE EXCEPTION
        'Public ID v3 contract cannot enforce %.publicId: % NULL or malformed rows.',
        spec.table_name,
        invalid_rows;
    END IF;

    EXECUTE format('SELECT COUNT(*) FROM %I', spec.table_name) INTO invalid_rows;

    EXECUTE format(
      'SELECT "publicId" FROM %I GROUP BY "publicId" HAVING COUNT(*) > 1 LIMIT 1',
      spec.table_name
    ) INTO duplicate_public_id;
    IF duplicate_public_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Public ID v3 contract cannot enforce %.publicId: duplicate value %.',
        spec.table_name,
        duplicate_public_id;
    END IF;

    EXECUTE format(
      'SELECT COUNT(*) '
      'FROM %I AS "row" '
      'LEFT JOIN "public_id_v3_migrations" AS "migration" '
      'ON "migration"."entityType" = $1 '
      'AND "migration"."internalId" = "row"."id" '
      'AND "migration"."newPublicId" = "row"."publicId" '
      'AND "migration"."migratedAt" IS NOT NULL '
      'WHERE "migration"."internalId" IS NULL',
      spec.table_name
    ) INTO ledger_mismatches USING spec.entity_type;
    IF ledger_mismatches <> 0 THEN
      RAISE EXCEPTION
        'Public ID v3 ledger does not cover % rows in %.',
        ledger_mismatches,
        spec.table_name;
    END IF;

    SELECT TRUE,
           index_meta.indisvalid
             AND index_meta.indisunique
             AND access_method.amname = 'btree'
             AND table_class.relname = spec.table_name
             AND index_meta.indpred IS NULL
             AND index_meta.indexprs IS NULL
             AND index_meta.indnkeyatts = 1
             AND index_meta.indnatts = 1
             AND ARRAY(
               SELECT attribute_meta.attname::text
                 FROM unnest(index_meta.indkey::smallint[]) WITH ORDINALITY
                   AS key_meta(attnum, ordinality)
                 JOIN pg_catalog.pg_attribute AS attribute_meta
                   ON attribute_meta.attrelid = index_meta.indrelid
                  AND attribute_meta.attnum = key_meta.attnum
                WHERE key_meta.ordinality <= index_meta.indnkeyatts
                ORDER BY key_meta.ordinality
             ) = ARRAY['publicId']::text[]
      INTO index_exists, index_matches
      FROM pg_catalog.pg_index AS index_meta
      JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_meta.indexrelid
      JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_meta.indrelid
      JOIN pg_catalog.pg_namespace AS namespace_meta
        ON namespace_meta.oid = index_class.relnamespace
      JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
     WHERE namespace_meta.nspname = current_schema()
       AND index_class.relname = spec.table_name || '_publicId_key';
    IF index_matches IS NOT TRUE THEN
      IF index_exists IS TRUE THEN
        RAISE EXCEPTION
          'Public ID v3 contract found an invalid unique-index definition for %.',
          spec.table_name;
      END IF;
      IF spec.table_name NOT IN (
        'rank_checks',
        'audit_logs',
        'triggered_alerts',
        'notifications'
      ) OR invalid_rows <> 0 THEN
        RAISE EXCEPTION
          'Public ID v3 contract is missing the required unique index for %.',
          spec.table_name;
      END IF;
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON %I ("publicId")',
        spec.table_name || '_publicId_key',
        spec.table_name
      );
    END IF;

    SELECT constraint_meta.convalidated,
           pg_catalog.pg_get_constraintdef(constraint_meta.oid, false)
      INTO constraint_validated, constraint_definition
      FROM pg_catalog.pg_constraint AS constraint_meta
      JOIN pg_catalog.pg_class AS table_class ON table_class.oid = constraint_meta.conrelid
     WHERE table_class.relnamespace = (
             SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = current_schema()
           )
       AND table_class.relname = spec.table_name
       AND constraint_meta.conname =
           spec.table_name || '_public_id_contract_format';
    IF constraint_definition IS NOT NULL
       AND regexp_replace(constraint_definition, ' NOT VALID$', '')
           <> format('CHECK (("publicId" ~ %L::text))', pattern) THEN
      RAISE EXCEPTION 'Public ID v3 contract found an invalid format check for %.',
        spec.table_name;
    END IF;
    IF constraint_definition IS NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK ("publicId" ~ %L) NOT VALID',
        spec.table_name,
        spec.table_name || '_public_id_contract_format',
        pattern
      );
      constraint_validated := FALSE;
    END IF;
    IF constraint_validated IS NOT TRUE THEN
      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        spec.table_name,
        spec.table_name || '_public_id_contract_format'
      );
    END IF;

    SELECT constraint_meta.convalidated,
           pg_catalog.pg_get_constraintdef(constraint_meta.oid, false)
      INTO constraint_validated, constraint_definition
      FROM pg_catalog.pg_constraint AS constraint_meta
      JOIN pg_catalog.pg_class AS table_class ON table_class.oid = constraint_meta.conrelid
     WHERE table_class.relnamespace = (
             SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = current_schema()
           )
       AND table_class.relname = spec.table_name
       AND constraint_meta.conname =
           spec.table_name || '_public_id_contract_not_null';
    IF constraint_definition IS NOT NULL
       AND regexp_replace(constraint_definition, ' NOT VALID$', '')
           <> 'CHECK (("publicId" IS NOT NULL))' THEN
      RAISE EXCEPTION
        'Public ID v3 contract found an invalid temporary non-null check for %.',
        spec.table_name;
    END IF;
    IF constraint_definition IS NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK ("publicId" IS NOT NULL) NOT VALID',
        spec.table_name,
        spec.table_name || '_public_id_contract_not_null'
      );
      constraint_validated := FALSE;
    END IF;
    IF constraint_validated IS NOT TRUE THEN
      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        spec.table_name,
        spec.table_name || '_public_id_contract_not_null'
      );
    END IF;
  END LOOP;

  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users'), ('sessions'), ('memberships'), ('projects'), ('keywords'),
        ('saved_keywords'), ('tags'), ('competitors'), ('rank_checks'),
        ('provider_connections'), ('api_keys'), ('personal_access_tokens'),
        ('audit_logs'), ('alert_rules'), ('triggered_alerts'), ('webhook_endpoints'),
        ('saved_views'), ('notifications'), ('invites'), ('migration_tokens'),
        ('cloud_import_jobs'), ('ingest_hooks'), ('signals')
      ) AS required(table_name)
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN "publicId" SET NOT NULL',
      spec.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT %I',
      spec.table_name,
      spec.table_name || '_public_id_contract_not_null'
    );
  END LOOP;
END
$$;

COMMIT;
