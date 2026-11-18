-- Host-owned schema 2. Prisma 7 does not wrap PostgreSQL migration files in a transaction:
-- https://www.prisma.io/blog/prisma-migrate-dx-primitives#what-if-schema-migrations-were-atomic
-- One DO statement is atomic without committing a caller's transaction. Successful Prisma
-- deploys are not replayed; exact history and column checks also permit an explicit retry.
-- Failed deploys retain a failed _prisma_migrations record. After fixing the cause, resolve
-- this migration as --rolled-back before retrying migrate deploy (Prisma v7 recovery docs).
-- Follow 20261027210000's 5s lock timeout: lock contention aborts everything; retry after
-- the blocker drains. The ACCESS EXCLUSIVE lock lasts through both backfill scans.
DO $$
DECLARE
  receipt_table regclass;
  scale_column smallint;
BEGIN
  SET LOCAL TIME ZONE 'UTC';
  SET LOCAL lock_timeout = '5s';
  -- A visible public ledger must not shadow the selected schema's missing ledger.
  PERFORM set_config('search_path', quote_ident(current_schema()), true);
  CREATE TABLE IF NOT EXISTS metering_schema_version (
    version integer PRIMARY KEY,
    checksum text NOT NULL
  );
  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid='metering_schema_version'::regclass AND attnum>0 AND NOT attisdropped) <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='metering_schema_version'::regclass AND attname='version'
        AND atttypid='integer'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='metering_schema_version'::regclass AND attname='checksum'
        AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a
      ON a.attrelid=c.conrelid AND a.attname='version'
      WHERE c.conrelid='metering_schema_version'::regclass AND c.contype='p'
        AND c.conkey=ARRAY[a.attnum]) THEN
    RAISE EXCEPTION 'Unsupported or modified metering schema table shape';
  END IF;
  IF EXISTS (
    SELECT 1 FROM metering_schema_version
    WHERE (version IS DISTINCT FROM 1
      OR checksum IS DISTINCT FROM '8bde4689f110958a69c404bcd6d1f011c5e20fbaf506be64c35f02e0a159d434')
      AND (version IS DISTINCT FROM 2
      OR checksum IS DISTINCT FROM '0cdaea0943a153357cb4a1aa4b27a6fd73943410ff06247babe234829b76caee')
  ) OR (EXISTS (SELECT 1 FROM metering_schema_version WHERE version=2)
    AND NOT EXISTS (SELECT 1 FROM metering_schema_version WHERE version=1)) THEN
    RAISE EXCEPTION 'Unsupported or modified metering schema history';
  END IF;
  receipt_table := 'metering_receipt'::regclass;
  SELECT attnum INTO scale_column FROM pg_attribute
    WHERE attrelid=receipt_table AND attname='cost_scale' AND NOT attisdropped;
  IF scale_column IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=receipt_table AND a.attnum=scale_column
        AND a.atttypid='integer'::regtype AND a.attnotnull
        AND a.attgenerated='' AND a.attidentity=''
        AND pg_get_expr(d.adbin,d.adrelid)='4')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=receipt_table
      AND conname='metering_receipt_cost_scale_check' AND contype='c' AND convalidated
      AND pg_get_expr(conbin,conrelid)='((cost_scale >= 0) AND (cost_scale <= 18))')
  ) THEN
    RAISE EXCEPTION 'Unsupported or modified metering cost_scale';
  END IF;
  IF EXISTS (SELECT 1 FROM metering_schema_version WHERE version=2) AND scale_column IS NULL THEN
    RAISE EXCEPTION 'Unsupported or modified metering cost_scale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM metering_schema_version WHERE version=2) THEN
    INSERT INTO metering_schema_version(version, checksum)
    VALUES (1, '8bde4689f110958a69c404bcd6d1f011c5e20fbaf506be64c35f02e0a159d434')
    ON CONFLICT (version) DO NOTHING;
    ALTER TABLE metering_receipt ADD COLUMN IF NOT EXISTS cost_scale integer NOT NULL DEFAULT 4
      CHECK (cost_scale BETWEEN 0 AND 18);
    -- Ordinary legacy rows already receive 4 from the default; avoid rewriting them.
    UPDATE metering_receipt
    SET cost_scale = COALESCE((body->'cost'->'money'->>'scale')::integer, 4)
    WHERE body->'cost'->'money' ? 'scale';
    UPDATE metering_receipt SET body = body #- '{cost,money,scale}'
    WHERE cost_scale = 4 AND body->'cost'->'money' ? 'scale';
  END IF;
  -- The old codec preserves unknown scale fields but its writer omits cost_scale.
  -- Reject mismatches during the legacy-only overlap without changing schema-2 definitions.
  CREATE OR REPLACE FUNCTION metering_receipt_scale_guard() RETURNS trigger
  LANGUAGE plpgsql AS $guard$
  BEGIN
    IF ((NEW.body#>'{cost,money}') ? 'scale'
        AND jsonb_typeof(NEW.body#>'{cost,money,scale}') IS DISTINCT FROM 'number')
      OR NEW.cost_scale IS DISTINCT FROM COALESCE((NEW.body#>>'{cost,money,scale}')::integer, 4) THEN
      RAISE EXCEPTION 'Metering receipt money scale mismatch' USING ERRCODE='23514';
    END IF;
    IF NEW.cost_scale=4 THEN
      NEW.body := NEW.body #- '{cost,money,scale}';
    END IF;
    RETURN NEW;
  END;
  $guard$;
  DROP TRIGGER IF EXISTS metering_receipt_scale_guard ON metering_receipt;
  CREATE TRIGGER metering_receipt_scale_guard BEFORE INSERT OR UPDATE OF body,cost_scale
    ON metering_receipt FOR EACH ROW EXECUTE FUNCTION metering_receipt_scale_guard();
  INSERT INTO metering_schema_version(version, checksum)
  VALUES (2, '0cdaea0943a153357cb4a1aa4b27a6fd73943410ff06247babe234829b76caee')
  ON CONFLICT (version) DO NOTHING;
END;
$$;
