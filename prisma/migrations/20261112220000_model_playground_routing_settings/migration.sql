-- Admit bounded workspace observation and eligibility violations without rewriting old rows.
CREATE FUNCTION model_playground_result_selection(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE settings JSONB; allowed JSONB; slug JSONB; outside BOOLEAN := false;
BEGIN
  settings := value->'column'->'settings';
  IF settings ? 'workspaceId' AND NOT (
    value->'column'->>'providerId'='anthropic'
    AND jsonb_typeof(settings->'workspaceId')='string'
    AND length(settings->>'workspaceId')<=71
    AND settings->>'workspaceId' ~ '^wrkspc_[A-Za-z0-9]{1,64}$'
  ) IS TRUE THEN RETURN false; END IF;
  IF settings ? 'allowedProviders' THEN
    allowed := settings->'allowedProviders';
    IF NOT (value->'column'->>'providerId'='vercel_ai_gateway' AND jsonb_typeof(allowed)='array') IS TRUE
      THEN RETURN false; END IF;
    IF jsonb_array_length(allowed) NOT BETWEEN 1 AND 16 OR
      (SELECT count(DISTINCT entry) FROM jsonb_array_elements(allowed) entry)<>jsonb_array_length(allowed)
      THEN RETURN false; END IF;
    FOR slug IN SELECT * FROM jsonb_array_elements(allowed) LOOP
      IF NOT (jsonb_typeof(slug)='string' AND slug #>> '{}' IN ('alibaba','anthropic','azure','baseten','bedrock','bfl','boundless','browserbase','bytedance','callstack','cerebras','claudeaws','cohere','crusoe','deepinfra','deepseek','digitalocean','elevenlabs','elorian','exa','fireworks','fish-audio','friendli','gmicloud','google','groq','heygen','humansand','inception','inceptron','inference-net','interfaze','klingai','liquid','meituan','meta','minimax','mistral','mixedbread','modal','moonshotai','morph','nace-ai','nebius','novita','nvidia','openai','parallel','parasail','pareto','particle','perplexity','poolside','prodia','quiverai','recraft','reflection','relace','runinfra','runware','sail-research','sakana','scaledown','stealth','stepfun','streamlake','subconscious','tako','telnyx','tencent','thinkingmachines','togetherai','topaz','typesafe-ai','vertex','voyage','wafer','xai','xiaomi','zai')) IS TRUE
        THEN RETURN false; END IF;
    END LOOP;
    outside := value->'actualProviderId'<>'null'::jsonb AND NOT allowed ? (value->>'actualProviderId');
  END IF;
  IF value ? 'resolvedWorkspaceId' AND NOT (
    value->'column'->>'providerId'='anthropic' AND
    (value->'resolvedWorkspaceId'='null'::jsonb OR (
      jsonb_typeof(value->'resolvedWorkspaceId')='string'
      AND length(value->>'resolvedWorkspaceId')<=71
      AND value->>'resolvedWorkspaceId' ~ '^wrkspc_[A-Za-z0-9]{1,64}$'))
  ) IS TRUE THEN RETURN false; END IF;
  IF value ? 'routingViolation' AND NOT (value->'routingViolation' IN (
    'null'::jsonb, '"provider_outside_allowed_set"'::jsonb
  )) IS TRUE THEN RETURN false; END IF;
  RETURN COALESCE(value->>'routingViolation'='provider_outside_allowed_set',false)=outside;
END $$;

ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_result_shape,
ADD CONSTRAINT model_playground_result_shape CHECK (result IS NULL OR (
  jsonb_typeof(result)='object' AND result->>'version'='1' AND result->'column'=config AND result->>'state'=state
  AND result ? 'actualProviderId' AND (result->'actualProviderId'='null'::jsonb OR (
    jsonb_typeof(result->'actualProviderId')='string' AND length(result->>'actualProviderId') BETWEEN 1 AND 256
    AND result->>'actualProviderId' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'))
  AND (result->'answer'='null'::jsonb OR (jsonb_typeof(result->'answer')='string' AND octet_length(result->>'answer')<=24576))
  AND jsonb_typeof(result->'citations')='array' AND jsonb_array_length(result->'citations')<=100
  AND octet_length(result::text)<=262144 AND model_playground_safe_json(result)
  AND result - ARRAY['version','column','actualProviderId','actualModelId','providerRequestId','state','failure','startedAt','finishedAt','durationMs','answer','truncation','citations','usage','providerCost','paymentReceipt','rawEvidenceId','consultedSources','citationTotals','costEvidence','routingAttemptCredentials','resolvedWorkspaceId','routingViolation'] = '{}'::jsonb
  AND model_playground_result_selection(result)
  AND (NOT result ? 'consultedSources' OR model_playground_result_sources(result->'consultedSources'))
  AND (NOT result ? 'citationTotals' OR model_playground_result_totals(result->'citationTotals'))
  AND (NOT result ? 'routingAttemptCredentials' OR model_playground_result_routing(result->'routingAttemptCredentials'))
  AND (NOT result ? 'costEvidence' OR model_playground_result_cost(result->'costEvidence'))
) IS TRUE);
