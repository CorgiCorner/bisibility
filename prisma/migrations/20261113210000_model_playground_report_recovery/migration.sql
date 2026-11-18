-- Durable report custody, independent of paid result retention.
ALTER TABLE model_playground_runs
  ADD COLUMN IF NOT EXISTS "reportState" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "reportAttemptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportFailure" TEXT;

-- Old null links cannot distinguish never-saved runs from deliberately deleted reports.
UPDATE model_playground_runs SET "reportState"='unclassified' WHERE "reportId" IS NULL;
UPDATE model_playground_runs SET "reportState"='saved',
  "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "reportId" IS NOT NULL;

ALTER TABLE model_playground_runs ADD CONSTRAINT model_playground_report_bookkeeping CHECK (("reportAttemptedAt" IS NULL OR isfinite("reportAttemptedAt")) AND (
  ("reportState" IN ('none','unclassified') AND "reportId" IS NULL AND "reportAttemptedAt" IS NULL AND "reportFailure" IS NULL)
  OR ("reportState"='saved' AND "reportId" IS NOT NULL AND "reportAttemptedAt" IS NOT NULL AND "reportFailure" IS NULL)
  OR ("reportState"='dismissed' AND "reportId" IS NULL AND "reportFailure" IS NULL)
  OR ("reportState"='failed' AND "reportId" IS NULL AND "reportAttemptedAt" IS NOT NULL
    AND "reportFailure" IS NOT NULL AND "reportFailure" IN ('too_large','conflict','storage'))
));

CREATE FUNCTION guard_model_playground_report_bookkeeping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."reportState"='dismissed' AND
    (NEW."reportState"<>'dismissed' OR NEW."reportId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Model Playground report was dismissed';
  END IF;
  IF TG_OP='UPDATE' AND OLD."reportId" IS NOT NULL AND NEW."reportId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM agent_reports WHERE "projectId"=OLD."projectId" AND id=OLD."reportId") THEN
    NEW."reportState" := 'dismissed';
    NEW."reportFailure" := NULL;
  ELSIF NEW."reportId" IS NOT NULL THEN
    NEW."reportState" := 'saved';
    NEW."reportAttemptedAt" := COALESCE(NEW."reportAttemptedAt",clock_timestamp() AT TIME ZONE 'UTC');
    NEW."reportFailure" := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER model_playground_report_bookkeeping BEFORE INSERT OR UPDATE ON model_playground_runs
  FOR EACH ROW EXECUTE FUNCTION guard_model_playground_report_bookkeeping();
CREATE INDEX model_playground_report_recovery_idx ON model_playground_runs("createdAt",id)
  WHERE "reportState" IN ('none','failed');
