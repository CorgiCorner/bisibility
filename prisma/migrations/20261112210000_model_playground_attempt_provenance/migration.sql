-- Add bounded, enum-only attempt provenance without rewriting retained rows.
CREATE FUNCTION model_playground_result_routing(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE attempt JSONB;
BEGIN
  IF NOT (jsonb_typeof(value)='object' AND value ?& ARRAY['version','completeness','attempts']
    AND value - ARRAY['version','completeness','attempts']='{}'::jsonb
    AND value->'version'='1'::jsonb
    AND value->>'completeness' IN ('complete','partial','unknown')
    AND jsonb_typeof(value->'attempts')='array') IS TRUE THEN RETURN false; END IF;
  IF jsonb_array_length(value->'attempts')>100 OR
    (value->>'completeness'='complete' AND jsonb_array_length(value->'attempts')=0)
    THEN RETURN false; END IF;
  FOR attempt IN SELECT * FROM jsonb_array_elements(value->'attempts') LOOP
    IF NOT (jsonb_typeof(attempt)='object'
      AND attempt - ARRAY['outcome','credentialSource']='{}'::jsonb
      AND attempt->>'outcome' IN ('succeeded','failed','unknown')
      AND attempt->>'credentialSource' IN ('gateway_system','customer_upstream','unknown')) IS TRUE
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION model_playground_result_cost(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE reported JSONB; upstream JSONB; estimate JSONB; slot TEXT;
BEGIN
  IF NOT (jsonb_typeof(value)='object'
    AND value ?& ARRAY['providerReported','upstreamInference','localEstimate']
    AND value - ARRAY['providerReported','upstreamInference','localEstimate','upstreamInferenceDiscardReason']='{}'::jsonb) IS TRUE
    THEN RETURN false; END IF;
  IF value ? 'upstreamInferenceDiscardReason' AND NOT (
    value->'upstreamInferenceDiscardReason' IN ('null'::jsonb, '"inconsistent"'::jsonb)
  ) IS TRUE THEN RETURN false; END IF;
  IF value->>'upstreamInferenceDiscardReason'='inconsistent' AND NOT (
    value->'upstreamInference'='null'::jsonb OR
    value->'upstreamInference'->'total'='null'::jsonb OR
    value->'upstreamInference'->'input'='null'::jsonb OR
    value->'upstreamInference'->'output'='null'::jsonb
  ) IS TRUE THEN RETURN false; END IF;
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
  AND result - ARRAY['version','column','actualProviderId','actualModelId','providerRequestId','state','failure','startedAt','finishedAt','durationMs','answer','truncation','citations','usage','providerCost','paymentReceipt','rawEvidenceId','consultedSources','citationTotals','costEvidence','routingAttemptCredentials'] = '{}'::jsonb
  AND (NOT result ? 'consultedSources' OR model_playground_result_sources(result->'consultedSources'))
  AND (NOT result ? 'citationTotals' OR model_playground_result_totals(result->'citationTotals'))
  AND (NOT result ? 'routingAttemptCredentials' OR model_playground_result_routing(result->'routingAttemptCredentials'))
  AND (NOT result ? 'costEvidence' OR model_playground_result_cost(result->'costEvidence'))
) IS TRUE);
