-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
CREATE TABLE measurement_settings_mutations (
  id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "actorId" text REFERENCES users(id) ON DELETE SET NULL, "actorScopeHash" char(64) NOT NULL,
  operation text NOT NULL CHECK (operation IN ('measurement_settings.intent','measurement_settings.schedule')),
  "keyHash" char(64) NOT NULL,"bodyHash" char(64) NOT NULL,"previousSourceHash" char(64) NOT NULL,
  "resultSourceHash" char(64) NOT NULL,result jsonb NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT measurement_settings_mutation_key UNIQUE ("projectId",operation,"keyHash"),
  CONSTRAINT measurement_settings_hashes CHECK (
    "actorScopeHash" ~ '^[a-f0-9]{64}$' AND "keyHash" ~ '^[a-f0-9]{64}$' AND "bodyHash" ~ '^[a-f0-9]{64}$' AND
    "previousSourceHash" ~ '^[a-f0-9]{64}$' AND "resultSourceHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT measurement_settings_result CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=8192
    AND CASE WHEN jsonb_typeof(result->'sourceHash')='string' THEN result->>'sourceHash'="resultSourceHash" ELSE FALSE END
    AND CASE WHEN jsonb_typeof(result->'revision')='number' THEN (result->>'revision')::numeric BETWEEN 0 AND 9007199254740991
      AND trunc((result->>'revision')::numeric)=(result->>'revision')::numeric ELSE FALSE END
    AND CASE WHEN jsonb_typeof(result->'selection')='object' THEN
      (result->'selection') ?& ARRAY['providerId','capabilityVersion','surface','geoId','languageCode','device','depth']
      AND (result->'selection')-ARRAY['providerId','capabilityVersion','surface','geoId','languageCode','device','depth']='{}'::jsonb ELSE FALSE END
    AND CASE WHEN jsonb_typeof(result->'defaultIntent')='object' THEN
      (result->'defaultIntent') ?& ARRAY['geoId','languageCode','device','depth']
      AND (result->'defaultIntent')-ARRAY['geoId','languageCode','device','depth']='{}'::jsonb ELSE FALSE END
    AND CASE WHEN jsonb_typeof(result->'schedule')='null' THEN TRUE WHEN jsonb_typeof(result->'schedule')='object' THEN
      (result->'schedule') ?& ARRAY['enabled','frequency','timezone','timeOfDay','weekday','dayOfMonth','cronExpression','jitterMinutes']
      AND (result->'schedule')-ARRAY['enabled','frequency','timezone','timeOfDay','weekday','dayOfMonth','cronExpression','jitterMinutes']='{}'::jsonb ELSE FALSE END
    AND result ? 'schedule' AND result ? 'scheduleId'
    AND result-ARRAY['revision','sourceHash','defaultIntent','selection','schedule','scheduleId']='{}'::jsonb)
);
CREATE FUNCTION measurement_settings_mutation_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD."projectId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'measurement_settings_receipt_retained' USING ERRCODE='23514';
  END IF;
  IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL AND pg_trigger_depth()>=2
    AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=OLD."actorId")
    AND to_jsonb(NEW)-'actorId'=to_jsonb(OLD)-'actorId' THEN RETURN NEW; END IF;
  IF to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'measurement_settings_receipt_immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER measurement_settings_mutation_immutable BEFORE UPDATE OR DELETE
ON measurement_settings_mutations FOR EACH ROW EXECUTE FUNCTION measurement_settings_mutation_immutable();
