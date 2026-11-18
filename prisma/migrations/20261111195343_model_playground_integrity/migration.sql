-- SQL-owned integrity complements the strict runtime contract on every write and read.
CREATE FUNCTION model_playground_safe_json(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item RECORD; child JSONB;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR item IN SELECT * FROM jsonb_each(value) LOOP
      IF lower(item.key) IN ('apikey','api_key','credentials','credentialsencrypted','authorization',
        'headers','password','secret','accesstoken','refreshtoken','baseurl','endpoint','quotetoken')
        OR NOT model_playground_safe_json(item.value) THEN RETURN false; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR child IN SELECT * FROM jsonb_array_elements(value) LOOP
      IF NOT model_playground_safe_json(child) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION model_playground_native_input(value JSONB) RETURNS BOOLEAN
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
      AND col->'payment'->>'fundingSource'='byok'
      AND col - ARRAY['columnId','providerId','connectionId','sourceKind','modelId','settings','payment']='{}'::jsonb
    ) IS TRUE THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT c->>'columnId') FROM jsonb_array_elements(value->'columns') c) <> jsonb_array_length(value->'columns')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(value->'columns') c GROUP BY c->>'providerId' HAVING count(DISTINCT c->>'connectionId')>1) THEN RETURN false; END IF;
  RETURN true;
END $$;

ALTER TABLE model_playground_previews ADD CONSTRAINT model_playground_preview_shape CHECK ((
  jsonb_typeof(snapshot)='object' AND snapshot->>'version'='1'
  AND snapshot->>'projectId'="projectId" AND snapshot->>'previewId'=id
  AND snapshot->>'configHash'="configHash" AND "configHash" ~ '^[a-f0-9]{64}$'
  AND octet_length(snapshot::text)<=32768 AND "expiresAt">"createdAt"
  AND model_playground_safe_json(snapshot)
  AND model_playground_native_input(snapshot->'input')
  AND snapshot - ARRAY['version','previewId','projectId','createdAt','expiresAt','configHash','input','columns'] = '{}'::jsonb
) IS TRUE);

ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_column_shape CHECK ((
  "providerId" IN ('openai','anthropic','openrouter','vercel_ai_gateway')
  AND config->>'providerId'="providerId" AND config->>'connectionId'="connectionId"
  AND config->>'columnId'="columnId" AND config->>'sourceKind'='raw_model'
  AND config->'payment'->>'fundingSource'='byok' AND model_playground_safe_json(config)
  AND config - ARRAY['columnId','providerId','connectionId','sourceKind','modelId','settings','payment'] = '{}'::jsonb
) IS TRUE);
ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_live_connection_scope CHECK (
  ("liveConnectionId" IS NULL AND "liveConnectionProjectId" IS NULL)
  OR ("liveConnectionId" IS NOT NULL AND "liveConnectionProjectId" IS NOT NULL AND "liveConnectionProjectId"="projectId")
);
ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_column_state CHECK (
  state IN ('queued','claimed','completed','partial','failed','unknown','cancelled')
  AND (state<>'queued' OR ("leaseToken" IS NULL AND "leaseExpiresAt" IS NULL AND "dispatchStartedAt" IS NULL AND result IS NULL AND "finishedAt" IS NULL))
  AND (state<>'claimed' OR ("leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND result IS NULL AND "finishedAt" IS NULL))
  AND (state IN ('queued','claimed') OR ("finishedAt" IS NOT NULL AND (result IS NOT NULL OR state='unknown')))
);
ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_result_shape CHECK (result IS NULL OR (
  jsonb_typeof(result)='object' AND result->>'version'='1' AND result->'column'=config AND result->>'state'=state
  AND result ? 'actualProviderId' AND (result->'actualProviderId'='null'::jsonb OR (
    jsonb_typeof(result->'actualProviderId')='string' AND length(result->>'actualProviderId') BETWEEN 1 AND 256
    AND result->>'actualProviderId' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'))
  AND (result->'answer'='null'::jsonb OR (jsonb_typeof(result->'answer')='string' AND octet_length(result->>'answer')<=24576))
  AND jsonb_typeof(result->'citations')='array' AND jsonb_array_length(result->'citations')<=100
  AND octet_length(result::text)<=262144 AND model_playground_safe_json(result)
  AND result - ARRAY['version','column','actualProviderId','actualModelId','providerRequestId','state','failure','startedAt','finishedAt','durationMs','answer','truncation','citations','usage','providerCost','paymentReceipt','rawEvidenceId'] = '{}'::jsonb
) IS TRUE);
ALTER TABLE model_playground_presets ADD CONSTRAINT model_playground_preset_manual CHECK (
  mode='manual' AND NOT "scheduleEnabled" AND model_playground_safe_json(config) AND model_playground_native_input(config)
);

CREATE FUNCTION guard_model_playground_preview() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Model Playground preview is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER model_playground_preview_immutable BEFORE UPDATE ON model_playground_previews
FOR EACH ROW EXECUTE FUNCTION guard_model_playground_preview();

CREATE FUNCTION guard_model_playground_run() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR (OLD."reportId" IS NOT NULL AND NEW."reportId" IS DISTINCT FROM OLD."reportId") THEN
    RAISE EXCEPTION 'Model Playground run is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER model_playground_run_immutable BEFORE INSERT OR UPDATE ON model_playground_runs
FOR EACH ROW EXECUTE FUNCTION guard_model_playground_run();

-- Public snapshot identity never becomes a credential lookup key by itself.
CREATE FUNCTION model_playground_live_connection(project_id TEXT, public_id TEXT, live_id TEXT, live_project_id TEXT, provider_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT live_project_id=project_id AND EXISTS (
    SELECT 1 FROM provider_connections WHERE id=live_id AND "publicId"=public_id
      AND "projectId"=project_id AND provider=provider_id AND kind='model' AND "credentialSource"='own'
  );
$$;

CREATE FUNCTION guard_model_playground_column() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen JSONB;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT snapshot INTO frozen FROM model_playground_runs WHERE "projectId"=NEW."projectId" AND id=NEW."runId";
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(frozen->'input'->'columns') c WHERE c=NEW.config)
      OR NEW.state<>'queued'
      OR model_playground_live_connection(NEW."projectId",NEW."connectionId",NEW."liveConnectionId",NEW."liveConnectionProjectId",NEW."providerId") IS NOT TRUE THEN
      RAISE EXCEPTION 'Model Playground column binding mismatch';
    END IF;
  ELSE
    -- Allow only a pure, one-way detach, including terminal rows changed by ON DELETE SET NULL.
    IF (NEW."liveConnectionId",NEW."liveConnectionProjectId") IS DISTINCT FROM (OLD."liveConnectionId",OLD."liveConnectionProjectId") THEN
      IF OLD."liveConnectionId" IS NULL OR NEW."liveConnectionId" IS NOT NULL OR NEW."liveConnectionProjectId" IS NOT NULL
        OR (to_jsonb(NEW)-ARRAY['liveConnectionId','liveConnectionProjectId']) IS DISTINCT FROM
           (to_jsonb(OLD)-ARRAY['liveConnectionId','liveConnectionProjectId']) THEN
        RAISE EXCEPTION 'Model Playground live connection is immutable';
      END IF;
      RETURN NEW;
    END IF;
    IF ((NEW.state='claimed' AND (OLD.state='queued' OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken"))
      OR (NEW."dispatchStartedAt" IS NOT NULL AND OLD."dispatchStartedAt" IS NULL))
      AND model_playground_live_connection(NEW."projectId",NEW."connectionId",NEW."liveConnectionId",NEW."liveConnectionProjectId",NEW."providerId") IS NOT TRUE THEN
      RAISE EXCEPTION 'Model Playground disconnected attempt is fenced';
    END IF;
    IF (NEW.id,NEW."projectId",NEW."runId",NEW."columnId",NEW."connectionId",NEW."providerId",NEW.config,NEW."operationKey")
      IS DISTINCT FROM (OLD.id,OLD."projectId",OLD."runId",OLD."columnId",OLD."connectionId",OLD."providerId",OLD.config,OLD."operationKey") THEN
      RAISE EXCEPTION 'Model Playground column is immutable';
    END IF;
    IF (OLD.state NOT IN ('queued','claimed') AND NEW IS DISTINCT FROM OLD)
      OR (OLD."dispatchStartedAt" IS NOT NULL AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt")
      OR (OLD.state='claimed' AND NEW.state='queued') THEN
      RAISE EXCEPTION 'Model Playground attempt is immutable';
    END IF;
    IF NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken" AND OLD.state='claimed'
      AND (OLD."dispatchStartedAt" IS NOT NULL OR OLD."leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC')) THEN
      RAISE EXCEPTION 'Model Playground lease is fenced';
    END IF;
    IF NEW."dispatchStartedAt" IS NOT NULL AND OLD."dispatchStartedAt" IS NULL
      AND (OLD.state<>'claimed' OR OLD."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken") THEN
      RAISE EXCEPTION 'Model Playground dispatch is fenced';
    END IF;
    IF NEW.state NOT IN ('queued','claimed') AND OLD.state IN ('queued','claimed') THEN
      IF OLD.state<>'claimed' OR (OLD."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') AND NOT
        (NEW.state='unknown' AND NEW.result IS NULL AND OLD."dispatchStartedAt" IS NOT NULL))
        OR (NEW.state IN ('completed','partial','unknown') AND OLD."dispatchStartedAt" IS NULL) THEN
        RAISE EXCEPTION 'Model Playground completion is fenced';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER model_playground_column_integrity BEFORE INSERT OR UPDATE ON model_playground_columns
FOR EACH ROW EXECUTE FUNCTION guard_model_playground_column();

CREATE FUNCTION guard_model_playground_preset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen JSONB;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Model Playground preset is immutable'; END IF;
  SELECT snapshot->'input' INTO frozen FROM model_playground_runs WHERE "projectId"=NEW."projectId" AND id=NEW."runId";
  IF NOT FOUND OR NEW.config IS DISTINCT FROM frozen THEN RAISE EXCEPTION 'Model Playground preset binding mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER model_playground_preset_integrity BEFORE INSERT OR UPDATE ON model_playground_presets
FOR EACH ROW EXECUTE FUNCTION guard_model_playground_preset();
