-- A pre-existing workspace predates this completion marker, so preserve its
-- established access as completed during the rollout.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "projects"
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

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
        'Project onboarding completion backfill requires the public ID v3 write gate row.';
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
       AND trigger_table.relname = 'projects'
       AND NOT trigger_meta.tgisinternal
       AND trigger_meta.tgname = 'public_id_v3_write_gate'
  ) THEN
    RAISE EXCEPTION
      'Project onboarding completion backfill found partial public ID v3 write-gate cleanup.';
  END IF;
END
$$;

UPDATE "projects"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;

COMMIT;
