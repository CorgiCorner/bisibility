-- Extend retained evidence without rewriting legacy rows or changing attempt custody.
CREATE FUNCTION model_playground_result_count(value JSONB) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT (value='null'::jsonb OR CASE WHEN jsonb_typeof(value)='number' THEN
    value::numeric BETWEEN 0 AND 9007199254740991 AND trunc(value::numeric)=value::numeric
    ELSE false END) IS TRUE;
$$;

CREATE FUNCTION model_playground_result_totals(value JSONB) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT (jsonb_typeof(value)='object'
    AND value - ARRAY['total','omitted']='{}'::jsonb
    AND model_playground_result_count(value->'total')
    AND model_playground_result_count(value->'omitted')) IS TRUE;
$$;

CREATE FUNCTION model_playground_result_sources(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE source JSONB;
BEGIN
  IF NOT (jsonb_typeof(value)='object'
    AND value - ARRAY['sources','total','omitted','truncated']='{}'::jsonb
    AND model_playground_result_totals(value - ARRAY['sources','truncated'])
    AND jsonb_typeof(value->'sources')='array'
    AND jsonb_typeof(value->'truncated')='boolean') IS TRUE THEN RETURN false; END IF;
  IF jsonb_array_length(value->'sources')>100 THEN RETURN false; END IF;
  FOR source IN SELECT * FROM jsonb_array_elements(value->'sources') LOOP
    IF NOT (jsonb_typeof(source)='object'
      AND source - ARRAY['sourceId','url','title']='{}'::jsonb
      AND jsonb_typeof(source->'sourceId')='string'
      AND length(source->>'sourceId') BETWEEN 1 AND 256
      AND source->>'sourceId' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
      AND jsonb_typeof(source->'url')='string' AND length(source->>'url') BETWEEN 1 AND 2048
      AND (source->'title'='null'::jsonb OR
        (jsonb_typeof(source->'title')='string' AND length(source->>'title')<=512))) IS TRUE
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION model_playground_result_money(value JSONB, certainty TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT (jsonb_typeof(value)='object'
    AND value - ARRAY['amount','currency','certainty','basis','rateCardVersion']='{}'::jsonb
    AND jsonb_typeof(value->'amount')='string' AND length(value->>'amount')<=2048
    AND value->>'amount' ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    AND jsonb_typeof(value->'currency')='string' AND value->>'currency' ~ '^[A-Z]{3}$'
    AND value->>'certainty'=certainty
    AND CASE WHEN certainty='reported' THEN
      value->>'basis' IN ('provider_response','original_request_readback')
      AND value->'rateCardVersion'='null'::jsonb
    WHEN certainty='estimated' THEN
      value->>'basis'='rate_card' AND jsonb_typeof(value->'rateCardVersion')='string'
      AND length(value->>'rateCardVersion') BETWEEN 1 AND 256
      AND value->>'rateCardVersion' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    ELSE false END) IS TRUE;
$$;

CREATE FUNCTION model_playground_result_scope(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE slot TEXT; part JSONB; components TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT (jsonb_typeof(value)='object' AND value->>'kind' IN ('total','subtotal','unknown')
    AND value - ARRAY['kind','includes','excludes','unknown']='{}'::jsonb) IS TRUE
    THEN RETURN false; END IF;
  FOREACH slot IN ARRAY ARRAY['includes','excludes','unknown'] LOOP
    IF jsonb_typeof(value->slot) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(value->slot)>6 THEN RETURN false; END IF;
    FOR part IN SELECT * FROM jsonb_array_elements(value->slot) LOOP
      IF NOT (jsonb_typeof(part)='string' AND part #>> '{}' IN
        ('inference','tools','routing','reporting_writes','zero_data_retention','other')) IS TRUE
        THEN RETURN false; END IF;
      components := array_append(components, part #>> '{}');
    END LOOP;
  END LOOP;
  RETURN cardinality(components)=6 AND (SELECT count(DISTINCT c) FROM unnest(components) c)=6
    AND (value->>'kind'<>'total' OR
      (jsonb_array_length(value->'excludes')=0 AND jsonb_array_length(value->'unknown')=0));
END $$;

CREATE FUNCTION model_playground_result_cost(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE reported JSONB; upstream JSONB; estimate JSONB; slot TEXT;
BEGIN
  IF NOT (jsonb_typeof(value)='object'
    AND value ?& ARRAY['providerReported','upstreamInference','localEstimate']
    AND value - ARRAY['providerReported','upstreamInference','localEstimate']='{}'::jsonb) IS TRUE
    THEN RETURN false; END IF;
  reported := value->'providerReported'; upstream := value->'upstreamInference'; estimate := value->'localEstimate';
  IF reported<>'null'::jsonb AND NOT (jsonb_typeof(reported)='object'
    AND reported - ARRAY['money','scope']='{}'::jsonb
    AND model_playground_result_money(reported->'money','reported')
    AND model_playground_result_scope(reported->'scope')) IS TRUE THEN RETURN false; END IF;
  IF upstream<>'null'::jsonb THEN
    IF NOT (jsonb_typeof(upstream)='object' AND upstream ?& ARRAY['total','input','output']
      AND upstream - ARRAY['total','input','output']='{}'::jsonb) IS TRUE THEN RETURN false; END IF;
    FOREACH slot IN ARRAY ARRAY['total','input','output'] LOOP
      IF upstream->slot<>'null'::jsonb AND NOT model_playground_result_money(upstream->slot,'reported')
        THEN RETURN false; END IF;
    END LOOP;
  END IF;
  IF estimate<>'null'::jsonb AND NOT model_playground_result_money(estimate,'estimated') THEN RETURN false; END IF;
  RETURN true;
END $$;

-- Bind the recursive prerequisite too, so restored checks survive an empty search_path.
ALTER FUNCTION model_playground_safe_json(JSONB) SET search_path FROM CURRENT;

ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_result_shape,
ADD CONSTRAINT model_playground_result_shape CHECK (result IS NULL OR (
  jsonb_typeof(result)='object' AND result->>'version'='1' AND result->'column'=config AND result->>'state'=state
  AND result ? 'actualProviderId' AND (result->'actualProviderId'='null'::jsonb OR (
    jsonb_typeof(result->'actualProviderId')='string' AND length(result->>'actualProviderId') BETWEEN 1 AND 256
    AND result->>'actualProviderId' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'))
  AND (result->'answer'='null'::jsonb OR (jsonb_typeof(result->'answer')='string' AND octet_length(result->>'answer')<=24576))
  AND jsonb_typeof(result->'citations')='array' AND jsonb_array_length(result->'citations')<=100
  AND octet_length(result::text)<=262144 AND model_playground_safe_json(result)
  AND result - ARRAY['version','column','actualProviderId','actualModelId','providerRequestId','state','failure','startedAt','finishedAt','durationMs','answer','truncation','citations','usage','providerCost','paymentReceipt','rawEvidenceId','consultedSources','citationTotals','costEvidence'] = '{}'::jsonb
  AND (NOT result ? 'consultedSources' OR model_playground_result_sources(result->'consultedSources'))
  AND (NOT result ? 'citationTotals' OR model_playground_result_totals(result->'citationTotals'))
  AND (NOT result ? 'costEvidence' OR model_playground_result_cost(result->'costEvidence'))
) IS TRUE);
