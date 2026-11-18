BEGIN;
SET LOCAL lock_timeout = '5s';

-- Old instances can still save a choice while the new version is being promoted.
CREATE FUNCTION carry_legacy_project_ai_funding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM projects p
  WHERE p.id = NEW."projectId" AND p."ownerId" = NEW."userId"
  FOR NO KEY UPDATE;
  IF NOT FOUND OR NEW.mode NOT IN ('byok', 'credits') THEN
    RETURN NEW;
  END IF;

  INSERT INTO project_ai_funding_preferences (id, "projectId", provider, mode, "createdAt", "updatedAt")
  VALUES (NEW.id, NEW."projectId", NEW.provider, NEW.mode, NEW."createdAt", NEW."updatedAt")
  ON CONFLICT ("projectId", provider) DO UPDATE
  SET mode = EXCLUDED.mode, "updatedAt" = EXCLUDED."updatedAt"
  WHERE project_ai_funding_preferences."updatedAt" < EXCLUDED."updatedAt";
  RETURN NEW;
END;
$$;

CREATE TRIGGER carry_legacy_project_ai_funding
AFTER INSERT OR UPDATE OF mode, "updatedAt" ON assistant_funding_preferences
FOR EACH ROW EXECUTE FUNCTION carry_legacy_project_ai_funding();

-- Catch updates committed after the initial backfill and before this bridge.
INSERT INTO project_ai_funding_preferences (id, "projectId", provider, mode, "createdAt", "updatedAt")
SELECT f.id, f."projectId", f.provider, f.mode, f."createdAt", f."updatedAt"
FROM assistant_funding_preferences f
JOIN projects p ON p.id = f."projectId" AND p."ownerId" = f."userId"
WHERE f.mode IN ('byok', 'credits')
ON CONFLICT ("projectId", provider) DO UPDATE
SET mode = EXCLUDED.mode, "updatedAt" = EXCLUDED."updatedAt"
WHERE project_ai_funding_preferences."updatedAt" < EXCLUDED."updatedAt";

COMMIT;
