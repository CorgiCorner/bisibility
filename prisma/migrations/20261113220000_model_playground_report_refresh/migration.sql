-- Report refresh failures retain their link and obey report-only retry policy.
ALTER TABLE model_playground_runs DROP CONSTRAINT model_playground_report_bookkeeping;
ALTER TABLE model_playground_runs ADD CONSTRAINT model_playground_report_bookkeeping CHECK (("reportAttemptedAt" IS NULL OR isfinite("reportAttemptedAt")) AND (
  ("reportState" IN ('none','unclassified') AND "reportId" IS NULL AND "reportAttemptedAt" IS NULL AND "reportFailure" IS NULL)
  OR ("reportState"='saved' AND "reportId" IS NOT NULL AND "reportAttemptedAt" IS NOT NULL AND "reportFailure" IS NULL)
  OR ("reportState"='saved_stale' AND "reportId" IS NOT NULL AND "reportAttemptedAt" IS NOT NULL
    AND "reportFailure" IS NOT NULL AND "reportFailure" IN ('too_large','conflict','storage'))
  OR ("reportState"='dismissed' AND "reportId" IS NULL AND "reportFailure" IS NULL)
  OR ("reportState"='failed' AND "reportId" IS NULL AND "reportAttemptedAt" IS NOT NULL
    AND "reportFailure" IS NOT NULL AND "reportFailure" IN ('too_large','conflict','storage'))
));

CREATE OR REPLACE FUNCTION guard_model_playground_report_bookkeeping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."reportState"='dismissed' AND
    (NEW."reportState"<>'dismissed' OR NEW."reportId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Model Playground report was dismissed';
  END IF;
  IF TG_OP='UPDATE' AND OLD."reportId" IS NOT NULL AND NEW."reportId" IS NULL THEN
    NEW."reportState" := 'dismissed';
    NEW."reportFailure" := NULL;
  ELSIF NEW."reportId" IS NOT NULL AND (TG_OP='INSERT' OR OLD."reportId" IS DISTINCT FROM NEW."reportId") THEN
    NEW."reportState" := 'saved';
    NEW."reportAttemptedAt" := COALESCE(NEW."reportAttemptedAt",clock_timestamp() AT TIME ZONE 'UTC');
    NEW."reportFailure" := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP INDEX model_playground_report_recovery_idx;
CREATE INDEX model_playground_report_recovery_idx ON model_playground_runs("createdAt",id)
  WHERE "reportState" IN ('none','failed','saved_stale');

-- Unlinking is itself a dismissal; a replacement link remains forbidden.
CREATE OR REPLACE FUNCTION guard_model_playground_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen RECORD;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT snapshot,"actorId","configHash" INTO frozen FROM model_playground_previews
      WHERE "projectId"=NEW."projectId" AND id=NEW."previewId";
    IF NOT FOUND OR (NEW.snapshot,NEW."actorId",NEW."configHash") IS DISTINCT FROM
      (frozen.snapshot,frozen."actorId",frozen."configHash") THEN
      RAISE EXCEPTION 'Model Playground preview binding mismatch';
    END IF;
  ELSIF (NEW.id,NEW."projectId",NEW."actorId",NEW."requestId",NEW."previewId",NEW."configHash",NEW.snapshot,NEW."createdAt")
    IS DISTINCT FROM (OLD.id,OLD."projectId",OLD."actorId",OLD."requestId",OLD."previewId",OLD."configHash",OLD.snapshot,OLD."createdAt")
    OR (OLD."reportId" IS NOT NULL AND NEW."reportId" IS DISTINCT FROM OLD."reportId"
      AND NEW."reportId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Model Playground run is immutable';
  END IF;
  RETURN NEW;
END $$;
