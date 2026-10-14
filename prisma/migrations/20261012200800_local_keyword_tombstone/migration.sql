-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- ROOT REVIEW PROPOSAL ONLY, NOT APPLIED/EXECUTED. Separate from the one-proof model.
ALTER TABLE local_measurement_targets ALTER COLUMN "keywordId" DROP NOT NULL;
ALTER TABLE local_measurement_targets DROP CONSTRAINT "local_targets_keyword_fk";
ALTER TABLE local_measurement_targets ADD CONSTRAINT "local_targets_keyword_fk"
  FOREIGN KEY ("projectId","keywordId") REFERENCES keywords("projectId",id)
  ON DELETE SET NULL ("keywordId");

CREATE OR REPLACE FUNCTION "guard_local_measurement_immutable"() RETURNS trigger
  LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  -- Nested branch: point rows do not have a keywordId field.
  IF TG_TABLE_NAME='local_measurement_targets' THEN
    IF OLD."keywordId" IS NOT NULL AND NEW."keywordId" IS NULL
      AND (pg_catalog.to_jsonb(NEW)-'keywordId')=(pg_catalog.to_jsonb(OLD)-'keywordId')
      AND pg_catalog.pg_trigger_depth()>=2 AND NOT EXISTS (
        SELECT 1 FROM keywords WHERE id=OLD."keywordId" AND "projectId"=OLD."projectId"
      ) THEN RETURN NEW; END IF;
  END IF;
  IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL
    AND (pg_catalog.to_jsonb(NEW)-'actorId')=(pg_catalog.to_jsonb(OLD)-'actorId')
    AND pg_catalog.pg_trigger_depth()>=2 AND NOT EXISTS (SELECT 1 FROM users WHERE id=OLD."actorId") THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Local measurement revisions are immutable' USING ERRCODE='23514';
END;
$$;

-- Existing direct connection deletion still fails at commit with a retained local item.
-- Full safe project cascade no longer depends on provider-connection/item RI trigger order.
ALTER TABLE local_measurement_run_items DROP CONSTRAINT "local_items_connection_fk";
ALTER TABLE local_measurement_run_items ADD CONSTRAINT "local_items_connection_fk"
  FOREIGN KEY ("projectId","connectionId") REFERENCES provider_connections("projectId",id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
