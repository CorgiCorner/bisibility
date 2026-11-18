-- Expand saved-run integrity for admitted Credits columns; preserve all own-key guards.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION model_playground_native_input(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE col JSONB;
BEGIN
  IF NOT (jsonb_typeof(value)='object' AND value->>'version'='1'
    AND jsonb_typeof(value->'prompt')='string' AND length(value->>'prompt') BETWEEN 1 AND 500
    AND octet_length(value->>'prompt')<=2000
    AND value->>'responseLanguage' ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$'
    AND value - ARRAY['version','prompt','responseLanguage','columns']='{}'::jsonb
    AND jsonb_typeof(value->'columns')='array' AND jsonb_array_length(value->'columns') BETWEEN 1 AND 6) IS TRUE THEN
    RETURN false;
  END IF;
  FOR col IN SELECT * FROM jsonb_array_elements(value->'columns') LOOP
    IF NOT (jsonb_typeof(col)='object' AND col->>'sourceKind'='raw_model'
      AND col->>'providerId' IN ('openai','anthropic','openrouter','vercel_ai_gateway')
      AND ((col->'payment'->>'fundingSource'='byok' AND col->>'connectionId' NOT LIKE 'platform:%') OR (
        col->'payment'->>'fundingSource'='platform'
        AND col->>'providerId' IN ('openai','anthropic','openrouter')
        AND col->>'connectionId'='platform:' || (col->>'providerId')
        AND col->'payment'->>'optionId'=col->>'connectionId'
      ))
      AND col - ARRAY['columnId','providerId','connectionId','sourceKind','modelId','settings','payment']='{}'::jsonb
    ) IS TRUE THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT c->>'columnId') FROM jsonb_array_elements(value->'columns') c) <> jsonb_array_length(value->'columns')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(value->'columns') c GROUP BY c->>'providerId' HAVING count(DISTINCT c->>'connectionId')>1) THEN RETURN false; END IF;
  RETURN true;
END $$;

ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_column_shape;
ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_column_shape CHECK ((
  "providerId" IN ('openai','anthropic','openrouter','vercel_ai_gateway')
  AND config->>'providerId'="providerId" AND config->>'connectionId'="connectionId"
  AND config->>'columnId'="columnId" AND config->>'sourceKind'='raw_model'
  AND ((config->'payment'->>'fundingSource'='byok' AND "connectionId" NOT LIKE 'platform:%') OR (
    config->'payment'->>'fundingSource'='platform'
    AND "providerId" IN ('openai','anthropic','openrouter')
    AND "connectionId"='platform:' || "providerId"
    AND config->'payment'->>'optionId'="connectionId"
    AND "liveConnectionId" IS NULL AND "liveConnectionProjectId" IS NULL
  )) AND model_playground_safe_json(config)
  AND config - ARRAY['columnId','providerId','connectionId','sourceKind','modelId','settings','payment'] = '{}'::jsonb
) IS TRUE) NOT VALID;

-- The platform branch is structural; the trigger below requires the accepted payment binding.
CREATE OR REPLACE FUNCTION model_playground_live_connection(project_id TEXT, public_id TEXT, live_id TEXT, live_project_id TEXT, provider_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT (live_project_id=project_id AND EXISTS (
    SELECT 1 FROM provider_connections WHERE id=live_id AND "publicId"=public_id
      AND "projectId"=project_id AND provider=provider_id AND kind='model' AND "credentialSource"='own'
  )) OR (provider_id IN ('openai','anthropic','openrouter')
    AND public_id='platform:' || provider_id AND live_id IS NULL AND live_project_id IS NULL);
$$;

CREATE OR REPLACE FUNCTION guard_model_playground_platform_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.config->'payment'->>'fundingSource' IS DISTINCT FROM 'platform' THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM model_playground_runs r
    JOIN model_playground_payment_quotes q ON q.id=r."previewId" AND q.project_id=r."projectId"
    JOIN model_playground_payment_attempts a ON a.quote_id=q.id AND a.column_id=NEW."columnId"
    WHERE r.id=NEW."runId" AND r."projectId"=NEW."projectId"
      AND q.accepted_at IS NOT NULL AND q.actor_id=r."actorId" AND a.principal=q.principal
      AND a.binding->>'projectId'=NEW."projectId"
      AND a.binding->>'fundingSource'='platform' AND a.binding->'column'=NEW.config
  ) THEN RAISE EXCEPTION 'Model Playground platform column requires an admitted payment'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS model_playground_platform_column_admission ON model_playground_columns;
CREATE TRIGGER model_playground_platform_column_admission
BEFORE INSERT OR UPDATE ON model_playground_columns
FOR EACH ROW EXECUTE FUNCTION guard_model_playground_platform_column();

COMMIT;
-- Validate old rows without holding the schema-change lock during the scan.
SET lock_timeout = '5s';
ALTER TABLE model_playground_columns VALIDATE CONSTRAINT model_playground_column_shape;
RESET lock_timeout;
