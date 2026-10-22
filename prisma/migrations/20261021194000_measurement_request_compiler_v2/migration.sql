-- Additive compiler compatibility: immutable v1 requests keep their original JSON and policy.
-- New v2 captures collect Top20 without intentional early stopping. No history rewrite.
CREATE OR REPLACE FUNCTION measurement_definition_binding_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE actual jsonb; head measurement_definition_heads; adapter jsonb; expected jsonb; depth integer; compiler_version integer; stop_on_match boolean;
BEGIN
  actual:=measurement_definition_source(NEW."projectId",NEW."keywordId");
  SELECT * INTO head FROM measurement_definition_heads WHERE "projectId"=NEW."projectId" AND "keywordId"=NEW."keywordId";
  IF actual IS NULL OR NEW.source IS DISTINCT FROM actual OR head."targetRevisionId" IS DISTINCT FROM NEW."targetRevisionId" OR head."policyRevisionId" IS DISTINCT FROM NEW."policyRevisionId" OR head.epochs IS DISTINCT FROM actual->'epochs' THEN RAISE EXCEPTION 'definition_binding_stale'; END IF;
  IF NEW.owner IS DISTINCT FROM jsonb_build_object('rankCheckId',NEW."rankCheckId",'executionKey',NEW."executionKey",'queuedTaskId',NEW."queuedTaskId") THEN RAISE EXCEPTION 'definition_owner_mismatch'; END IF;
  IF NEW."queuedTaskId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM queued_rank_check_tasks q JOIN queued_rank_check_batches b ON b.id=q."batchId" WHERE q.id=NEW."queuedTaskId" AND q."keywordId"=NEW."keywordId" AND q."rankCheckId"=NEW."rankCheckId" AND b."projectId"=NEW."projectId") THEN RAISE EXCEPTION 'definition_queue_owner_mismatch'; END IF;
  IF nullif(btrim(actual#>>'{target,domain}'),'') IS NULL OR lower(btrim(actual#>>'{target,domain}')) ~ '^workspace-[0-9a-f]{4,32}\.bisibility\.cloud$' OR actual#>>'{target,archivedAt}' IS NOT NULL OR actual#>>'{policy,config,forcedAiOverview}' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'definition_unavailable'; END IF;
  SELECT value INTO adapter FROM jsonb_array_elements(actual#>'{policy,config,adapters}') WHERE value->>'providerId'=NEW.request->>'providerId';
  depth:=(NEW.request->>'depth')::integer;
  IF adapter IS NULL OR adapter->>'nativeFindTargetsIn' IS NULL OR adapter->>'nativeFindTargetsIn' NOT IN ('none','with_subdomains_on_match') OR depth IS NULL OR depth NOT IN (10,20,50,100) THEN RAISE EXCEPTION 'definition_adapter_unavailable'; END IF;
  -- Missing version is the exact historical shape; do not add defaults to retained bytes.
  IF NOT (NEW.request ? 'compilerVersion') THEN compiler_version:=1;
  ELSIF NEW.request->'compilerVersion'='2'::jsonb THEN compiler_version:=2;
  ELSE RAISE EXCEPTION 'definition_request_compiler_unavailable'; END IF;
  stop_on_match:=coalesce((actual#>>'{policy,defaults,serpStopOnMatch}')::boolean,true);
  IF compiler_version=2 AND depth=20 THEN stop_on_match:=false; END IF;
  expected:=jsonb_build_object('engine','google','surface','web_serp','resultKind','organic_result','rankScale','organic_group',
    'providerId',adapter->'providerId','capabilityVersion',adapter->'capabilityVersion','adapterVersion',adapter->'adapterVersion','definitionVersion',actual#>'{policy,config,definitionVersion}',
    'keyword',actual#>'{target,text}','device',actual#>'{target,device}','domain',btrim(actual#>>'{target,domain}'),'targetUrl',actual#>'{target,targetUrl}','location',actual#>'{target,location}',
    'depth',depth,'stopOnMatch',stop_on_match,'findTargetsIn',CASE WHEN adapter->>'nativeFindTargetsIn'='with_subdomains_on_match' AND stop_on_match THEN 'with_subdomains' ELSE NULL END,'forcedAiOverview',false);
  IF compiler_version=2 THEN expected:=expected || jsonb_build_object('compilerVersion',2); END IF;
  IF NEW.request IS DISTINCT FROM expected THEN RAISE EXCEPTION 'definition_request_mismatch'; END IF;
  RETURN NEW;
END $$;
