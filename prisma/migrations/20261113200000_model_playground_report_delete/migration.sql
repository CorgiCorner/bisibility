-- Deletion unlinks only the report, never the project or the retained answer.
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
      AND NOT (NEW."reportId" IS NULL AND NOT EXISTS (
        SELECT 1 FROM agent_reports WHERE "projectId"=OLD."projectId" AND id=OLD."reportId"
      ))) THEN
    RAISE EXCEPTION 'Model Playground run is immutable';
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE model_playground_runs DROP CONSTRAINT "model_playground_runs_projectId_reportId_fkey";
ALTER TABLE model_playground_runs ADD CONSTRAINT "model_playground_runs_projectId_reportId_fkey"
  FOREIGN KEY ("projectId", "reportId") REFERENCES agent_reports("projectId", id)
  ON DELETE SET NULL ("reportId") ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
