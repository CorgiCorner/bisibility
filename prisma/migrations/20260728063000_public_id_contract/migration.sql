-- data-migration-contract: self-guarding
-- Release N+1: quiesce the application and Temporal workers before applying this migration.
SET lock_timeout = '5s';

DO $$
DECLARE
  spec RECORD;
  constraint_definition TEXT;
  constraint_validated BOOLEAN;
  duplicate_public_id TEXT;
  has_rows BOOLEAN;
  index_exists BOOLEAN;
  index_matches BOOLEAN;
  invalid_rows BIGINT;
  pattern TEXT;
BEGIN
  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users', 'usr'),
        ('sessions', 'ses'),
        ('memberships', 'member'),
        ('projects', 'prj'),
        ('keywords', 'kw'),
        ('saved_keywords', 'skw'),
        ('tags', 'tag'),
        ('competitors', 'comp'),
        ('rank_checks', 'check'),
        ('provider_connections', 'conn'),
        ('api_keys', 'key'),
        ('personal_access_tokens', 'pat'),
        ('audit_logs', 'audit'),
        ('alert_rules', 'rule'),
        ('triggered_alerts', 'alert'),
        ('webhook_endpoints', 'webhook'),
        ('saved_views', 'view'),
        ('notifications', 'notif'),
        ('invites', 'invite'),
        ('migration_tokens', 'mtok'),
        ('cloud_import_jobs', 'job'),
        ('ingest_hooks', 'hook'),
        ('signals', 'sig')
      ) AS required(table_name, prefix)
  LOOP
    pattern := format('^%s_[a-z][a-z0-9]{23}$', spec.prefix);
    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE "publicId" IS NULL OR "publicId" !~ %L',
      spec.table_name,
      pattern
    ) INTO invalid_rows;
    IF invalid_rows <> 0 THEN
      RAISE EXCEPTION
        'Public ID contract cannot enforce %.publicId: % NULL or malformed rows. Deploy release N, keep the app and worker quiesced, wait for preparation, then retry release N+1.',
        spec.table_name,
        invalid_rows;
    END IF;

    EXECUTE format(
      'SELECT "publicId" FROM %I GROUP BY "publicId" HAVING COUNT(*) > 1 LIMIT 1',
      spec.table_name
    ) INTO duplicate_public_id;
    IF duplicate_public_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Public ID contract cannot enforce %.publicId: duplicate value %. Deploy release N, keep the app and worker quiesced, wait for preparation, then retry release N+1.',
        spec.table_name,
        duplicate_public_id;
    END IF;
  END LOOP;

  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users', 'usr'),
        ('sessions', 'ses'),
        ('memberships', 'member'),
        ('projects', 'prj'),
        ('keywords', 'kw'),
        ('saved_keywords', 'skw'),
        ('tags', 'tag'),
        ('competitors', 'comp'),
        ('rank_checks', 'check'),
        ('provider_connections', 'conn'),
        ('api_keys', 'key'),
        ('personal_access_tokens', 'pat'),
        ('audit_logs', 'audit'),
        ('alert_rules', 'rule'),
        ('triggered_alerts', 'alert'),
        ('webhook_endpoints', 'webhook'),
        ('saved_views', 'view'),
        ('notifications', 'notif'),
        ('invites', 'invite'),
        ('migration_tokens', 'mtok'),
        ('cloud_import_jobs', 'job'),
        ('ingest_hooks', 'hook'),
        ('signals', 'sig')
      ) AS required(table_name, prefix)
  LOOP
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
      JOIN pg_catalog.pg_namespace AS namespace_meta ON namespace_meta.oid = index_class.relnamespace
      JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
     WHERE namespace_meta.nspname = current_schema()
       AND index_class.relname = spec.table_name || '_publicId_key';

    IF index_matches IS TRUE THEN
      CONTINUE;
    END IF;
    IF index_exists IS TRUE THEN
      RAISE EXCEPTION
        'Public ID contract found an invalid unique-index definition for %. Deploy release N, keep the app and worker quiesced, wait for preparation, then retry release N+1.',
        spec.table_name;
    END IF;
    IF spec.table_name NOT IN ('rank_checks', 'audit_logs', 'triggered_alerts', 'notifications') THEN
      RAISE EXCEPTION
        'Public ID contract is missing the required unique index for %. Deploy release N, keep the app and worker quiesced, wait for preparation, then retry release N+1.',
        spec.table_name;
    END IF;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', spec.table_name) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION
        'Public ID contract cannot create the high-volume unique index for nonempty %. Deploy release N, keep the app and worker quiesced, wait for preparation, then retry release N+1.',
        spec.table_name;
    END IF;
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON %I ("publicId")',
      spec.table_name || '_publicId_key',
      spec.table_name
    );
  END LOOP;

  FOR spec IN
    SELECT *
      FROM (VALUES
        ('users', 'usr'),
        ('sessions', 'ses'),
        ('memberships', 'member'),
        ('projects', 'prj'),
        ('keywords', 'kw'),
        ('saved_keywords', 'skw'),
        ('tags', 'tag'),
        ('competitors', 'comp'),
        ('rank_checks', 'check'),
        ('provider_connections', 'conn'),
        ('api_keys', 'key'),
        ('personal_access_tokens', 'pat'),
        ('audit_logs', 'audit'),
        ('alert_rules', 'rule'),
        ('triggered_alerts', 'alert'),
        ('webhook_endpoints', 'webhook'),
        ('saved_views', 'view'),
        ('notifications', 'notif'),
        ('invites', 'invite'),
        ('migration_tokens', 'mtok'),
        ('cloud_import_jobs', 'job'),
        ('ingest_hooks', 'hook'),
        ('signals', 'sig')
      ) AS required(table_name, prefix)
  LOOP
    pattern := format('^%s_[a-z][a-z0-9]{23}$', spec.prefix);
    SELECT constraint_meta.convalidated,
           pg_catalog.pg_get_constraintdef(constraint_meta.oid, false)
      INTO constraint_validated, constraint_definition
      FROM pg_catalog.pg_constraint AS constraint_meta
      JOIN pg_catalog.pg_class AS table_class ON table_class.oid = constraint_meta.conrelid
     WHERE table_class.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = current_schema())
       AND table_class.relname = spec.table_name
       AND constraint_meta.conname = spec.table_name || '_public_id_contract_format';
    IF constraint_definition IS NOT NULL
       AND regexp_replace(constraint_definition, ' NOT VALID$', '')
           <> format('CHECK (("publicId" ~ %L::text))', pattern) THEN
      RAISE EXCEPTION 'Public ID contract found an invalid format check for %.', spec.table_name;
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
     WHERE table_class.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = current_schema())
       AND table_class.relname = spec.table_name
       AND constraint_meta.conname = spec.table_name || '_public_id_contract_not_null';
    IF constraint_definition IS NOT NULL
       AND regexp_replace(constraint_definition, ' NOT VALID$', '')
           <> 'CHECK (("publicId" IS NOT NULL))' THEN
      RAISE EXCEPTION 'Public ID contract found an invalid temporary non-null check for %.', spec.table_name;
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
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "publicId" SET NOT NULL', spec.table_name);
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
      'ALTER TABLE %I DROP CONSTRAINT %I',
      spec.table_name,
      spec.table_name || '_public_id_contract_not_null'
    );
  END LOOP;
END $$;

DROP TABLE "public_id_migrations";
DROP TYPE "PublicIdEntityType";
ALTER TABLE "backlink_snapshots" DROP COLUMN "publicId";
RESET lock_timeout;
