BEGIN;

SET LOCAL lock_timeout = '30s';

CREATE TABLE "public_id_v3_write_gate" (
    "id" BOOLEAN NOT NULL DEFAULT TRUE,
    "phase" TEXT NOT NULL,
    "releasePolicy" TEXT NOT NULL,
    "targetAppRelease" TEXT NOT NULL,
    "writesBlocked" BOOLEAN NOT NULL DEFAULT TRUE,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releasedAppRelease" TEXT,

    CONSTRAINT "public_id_v3_write_gate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "public_id_v3_write_gate_singleton" CHECK ("id" IS TRUE),
    CONSTRAINT "public_id_v3_write_gate_phase" CHECK ("phase" IN ('public-id-v3-n', 'public-id-v3-n1')),
    CONSTRAINT "public_id_v3_write_gate_policy" CHECK ("releasePolicy" IN ('automatic', 'operator')),
    CONSTRAINT "public_id_v3_write_gate_target_release" CHECK ("targetAppRelease" ~ '^[0-9a-f]{40}$'),
    CONSTRAINT "public_id_v3_write_gate_released_state" CHECK (
      (
        "writesBlocked" IS TRUE
        AND "releasedAt" IS NULL
        AND "releasedAppRelease" IS NULL
      )
      OR
      (
        "writesBlocked" IS FALSE
        AND "releasedAt" IS NOT NULL
        AND "releasedAppRelease" = "targetAppRelease"
      )
    )
);

INSERT INTO "public_id_v3_write_gate" (
    "id",
    "phase",
    "releasePolicy",
    "targetAppRelease",
    "writesBlocked"
)
VALUES (
    TRUE,
    'public-id-v3-n',
    'automatic',
    '0000000000000000000000000000000000000000',
    TRUE
);

CREATE FUNCTION "enforce_public_id_v3_write_gate"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  active_phase TEXT;
  writes_blocked BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT "phase", "writesBlocked" '
    'FROM %I."public_id_v3_write_gate" WHERE "id" IS TRUE',
    TG_TABLE_SCHEMA
  ) INTO STRICT active_phase, writes_blocked;

  IF writes_blocked
     AND current_setting(
       'bisibility.public_id_write_gate_bypass',
       TRUE
     ) IS DISTINCT FROM active_phase
  THEN
    RAISE EXCEPTION 'Application writes are blocked during the public ID v3 cutover.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION "enforce_public_id_v3_write_gate"() FROM PUBLIC;

DO $$
DECLARE
  protected_table RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class AS table_meta
      JOIN pg_catalog.pg_namespace AS namespace_meta
        ON namespace_meta.oid = table_meta.relnamespace
     WHERE namespace_meta.nspname = current_schema()
       AND (
         table_meta.relkind = 'p'
         OR table_meta.relispartition
       )
  ) THEN
    RAISE EXCEPTION 'Public ID v3 write gate does not support partitioned tables.';
  END IF;

  FOR protected_table IN
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
      protected_table.schemaname,
      protected_table.tablename
    );
    EXECUTE format(
      'CREATE TRIGGER "public_id_v3_write_gate" '
      'BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION %I."enforce_public_id_v3_write_gate"()',
      protected_table.schemaname,
      protected_table.tablename,
      protected_table.schemaname
    );
  END LOOP;
END
$$;

COMMIT;
