-- Add only the two metadata objects in the installed shared SettingsSnapshot DTO.
-- Original receipt predicates, rows, attribution and immutable trigger remain intact.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);

CREATE FUNCTION measurement_settings_snapshot_metadata_valid(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    jsonb_typeof(v)='object' AND octet_length(v::text)<=8192
    AND (NOT v ? 'scopeSources' OR (
      jsonb_typeof(v->'scopeSources')='object'
      AND (v->'scopeSources') ?& ARRAY['geo','language','device','surface','depth','provider']
      AND (v->'scopeSources')-ARRAY['geo','language','device','surface','depth','provider']='{}'::jsonb
      AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(v->'scopeSources')='object'
          THEN v->'scopeSources' ELSE '{}'::jsonb END) field
        WHERE jsonb_typeof(field.value)<>'string'
          OR field.value #>> '{}' NOT IN ('project','schedule','keyword','explicit','unknown'))))
    AND (NOT v ? 'nextRun' OR (
      jsonb_typeof(v->'nextRun')='object'
      AND (v->'nextRun') ?& ARRAY['at','timezone','basis']
      AND (v->'nextRun')-ARRAY['at','timezone','basis']='{}'::jsonb
      AND jsonb_typeof(v->'nextRun'->'timezone')='string'
      AND v->'nextRun'->>'basis' IN ('captured_calendar','unavailable')
      AND (v->'nextRun'->'at'='null'::jsonb OR (
        jsonb_typeof(v->'nextRun'->'at')='string'
        AND v->'nextRun'->>'at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
        AND pg_input_is_valid(v->'nextRun'->>'at','timestamp with time zone'))))), FALSE);
$$;

DO $$
DECLARE installed_result text;
BEGIN
  SELECT pg_get_expr(c.conbin,c.conrelid) INTO STRICT installed_result
  FROM pg_constraint c
  WHERE c.conrelid='measurement_settings_mutations'::regclass
    AND c.conname='measurement_settings_result' AND c.contype='c';
  -- Projection is restricted to the exact typed metadata above. Every other
  -- property still passes through the unchanged installed expression.
  installed_result := regexp_replace(installed_result, '\mresult\M',
    '(CASE WHEN operation=''measurement_settings.defaults'' THEN result
      ELSE result - ARRAY[''scopeSources'',''nextRun''] END)', 'g');
  ALTER TABLE measurement_settings_mutations DROP CONSTRAINT measurement_settings_result;
  EXECUTE format('ALTER TABLE measurement_settings_mutations ADD CONSTRAINT measurement_settings_result CHECK
    ((%s) AND (operation=''measurement_settings.defaults''
      OR measurement_settings_snapshot_metadata_valid(result)))', installed_result);
END $$;
