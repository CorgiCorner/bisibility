-- Add the separately typed future-default receipt; existing intent/schedule
-- receipts retain their original predicate, attribution and immutable trigger.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);

CREATE FUNCTION measurement_settings_defaults_result_valid(v jsonb, source_hash text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    jsonb_typeof(v)='object' AND octet_length(v::text)<=8192
    AND v ?& ARRAY['revision','sourceHash','value','market','timestamps']
    AND v-ARRAY['revision','sourceHash','value','market','timestamps']='{}'::jsonb
    AND jsonb_typeof(v->'sourceHash')='string' AND v->>'sourceHash'=source_hash
    AND CASE WHEN jsonb_typeof(v->'revision')='string' AND v->>'revision' ~ '^(0|[1-9][0-9]{0,18})$'
      THEN (v->>'revision')::numeric<=9223372036854775807 ELSE FALSE END
    AND jsonb_typeof(v->'value')='object'
    AND (v->'value') ?& ARRAY['projectId','city','country','device','locationKey','frequency','cronExpression',
      'timezone','jitterMinutes','serpDepth','serpStopOnMatch','inspectionDailyLimit','searchSyncImportMonths','searchSyncPace']
    AND (v->'value')-ARRAY['projectId','city','country','device','locationKey','frequency','cronExpression',
      'timezone','jitterMinutes','serpDepth','serpStopOnMatch','inspectionDailyLimit','searchSyncImportMonths','searchSyncPace']='{}'::jsonb
    AND jsonb_typeof(v->'value'->'projectId')='string'
    AND length(v->'value'->>'projectId') BETWEEN 1 AND 120
    AND jsonb_typeof(v->'value'->'city') IN ('string','null')
    AND jsonb_typeof(v->'value'->'country') IN ('string','null')
    AND (v->'value'->'device'='null'::jsonb OR v->'value'->>'device' IN ('desktop','mobile'))
    AND jsonb_typeof(v->'value'->'locationKey') IN ('string','null')
    AND v->'value'->>'frequency' IN ('daily','weekly','monthly','manual','paused','custom_cron')
    AND jsonb_typeof(v->'value'->'cronExpression') IN ('string','null')
    AND jsonb_typeof(v->'value'->'timezone')='string'
    AND CASE WHEN jsonb_typeof(v->'value'->'jitterMinutes')='number' THEN
      (v->'value'->>'jitterMinutes')::numeric=trunc((v->'value'->>'jitterMinutes')::numeric) ELSE FALSE END
    AND jsonb_typeof(v->'value'->'serpDepth')='number' AND v->'value'->>'serpDepth' IN ('10','20','50','100')
    AND jsonb_typeof(v->'value'->'serpStopOnMatch')='boolean'
    AND CASE WHEN jsonb_typeof(v->'value'->'inspectionDailyLimit')='number' THEN
      (v->'value'->>'inspectionDailyLimit')::numeric=trunc((v->'value'->>'inspectionDailyLimit')::numeric) ELSE FALSE END
    AND CASE WHEN v->'value'->'searchSyncImportMonths'='null'::jsonb THEN TRUE
      WHEN jsonb_typeof(v->'value'->'searchSyncImportMonths')='number' THEN
      (v->'value'->>'searchSyncImportMonths')::numeric=trunc((v->'value'->>'searchSyncImportMonths')::numeric) ELSE FALSE END
    AND jsonb_typeof(v->'value'->'searchSyncPace') IN ('string','null')
    AND jsonb_typeof(v->'market')='object'
    AND (v->'market') ?& ARRAY['city','country','device','locationKey','source']
    AND (v->'market')-ARRAY['city','country','device','locationKey','source']='{}'::jsonb
    AND jsonb_typeof(v->'market'->'city') IN ('string','null')
    AND jsonb_typeof(v->'market'->'country')='string'
    AND v->'market'->>'device' IN ('desktop','mobile')
    AND jsonb_typeof(v->'market'->'locationKey')='string'
    AND v->'market'->>'source' IN ('explicit','derived','fallback')
    AND jsonb_typeof(v->'timestamps')='object'
    AND (v->'timestamps') ?& ARRAY['lastCheckedAt','nextCheckAt','updatedAt']
    AND (v->'timestamps')-ARRAY['lastCheckedAt','nextCheckAt','updatedAt']='{}'::jsonb
    AND jsonb_typeof(v->'timestamps'->'lastCheckedAt') IN ('string','null')
    AND jsonb_typeof(v->'timestamps'->'nextCheckAt') IN ('string','null')
    AND jsonb_typeof(v->'timestamps'->'updatedAt')='string', FALSE);
$$;

-- Preserve the installed old result expression literally inside its operation
-- branch, rather than translating its numeric revision or nested shape rules.
DO $$
DECLARE old_result text;
BEGIN
  SELECT pg_get_expr(c.conbin,c.conrelid) INTO STRICT old_result
  FROM pg_constraint c
  WHERE c.conrelid='measurement_settings_mutations'::regclass
    AND c.conname='measurement_settings_result' AND c.contype='c';
  ALTER TABLE measurement_settings_mutations DROP CONSTRAINT measurement_settings_result;
  EXECUTE format('ALTER TABLE measurement_settings_mutations ADD CONSTRAINT measurement_settings_result CHECK
    ((operation IN (''measurement_settings.intent'',''measurement_settings.schedule'') AND (%s))
    OR (operation=''measurement_settings.defaults'' AND measurement_settings_defaults_result_valid(result,"resultSourceHash")))',old_result);
END $$;

ALTER TABLE measurement_settings_mutations DROP CONSTRAINT measurement_settings_mutations_operation_check;
ALTER TABLE measurement_settings_mutations ADD CONSTRAINT measurement_settings_mutations_operation_check
CHECK (operation IN ('measurement_settings.intent','measurement_settings.schedule','measurement_settings.defaults'));
