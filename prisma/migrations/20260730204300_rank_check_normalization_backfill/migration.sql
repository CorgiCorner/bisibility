-- Backfill technical attempts only after the column DDL has committed.
-- Historical requested depth remains unknown when it was not persisted.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  gate_phase TEXT;
BEGIN
  IF to_regclass(
    format('%I.public_id_v3_write_gate', current_schema())
  ) IS NOT NULL THEN
    SELECT "phase"
      INTO gate_phase
      FROM "public_id_v3_write_gate"
     WHERE "id" IS TRUE;

    IF gate_phase IS NULL THEN
      RAISE EXCEPTION
        'Rank-check normalization backfill requires the public ID v3 write gate row.';
    END IF;

    PERFORM set_config(
      'bisibility.public_id_write_gate_bypass',
      gate_phase,
      TRUE
    );
  ELSIF to_regprocedure(
    format('%I.enforce_public_id_v3_write_gate()', current_schema())
  ) IS NOT NULL OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_meta
      JOIN pg_catalog.pg_class AS trigger_table
        ON trigger_table.oid = trigger_meta.tgrelid
      JOIN pg_catalog.pg_namespace AS trigger_namespace
        ON trigger_namespace.oid = trigger_table.relnamespace
     WHERE trigger_namespace.nspname = current_schema()
       AND trigger_table.relname = 'rank_checks'
       AND NOT trigger_meta.tgisinternal
       AND trigger_meta.tgname = 'public_id_v3_write_gate'
  ) THEN
    RAISE EXCEPTION
      'Rank-check normalization backfill found partial public ID v3 write-gate cleanup.';
  END IF;
END
$$;

UPDATE "rank_checks"
SET "normalizationVersion" = NULL
WHERE "status" <> 'completed'
  AND "normalizationVersion" IS NOT NULL;

COMMIT;
