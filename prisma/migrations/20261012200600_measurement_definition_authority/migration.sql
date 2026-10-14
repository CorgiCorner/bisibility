-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Additive authority only. Historical observations retain NULL bindings.

-- Semantic epochs are owned by the database, including settings A -> B -> A.
ALTER TABLE projects ADD COLUMN "measurementTargetEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementTargetEpoch">=0), ADD COLUMN "measurementPolicyEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementPolicyEpoch">=0), ADD COLUMN "measurementPolicyConfig" jsonb;
ALTER TABLE keywords ADD COLUMN "measurementTargetEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementTargetEpoch">=0), ADD COLUMN "measurementPolicyEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementPolicyEpoch">=0);
ALTER TABLE locations ADD COLUMN "measurementEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementEpoch">=0);
ALTER TABLE check_schedules ADD COLUMN "measurementEpoch" bigint NOT NULL DEFAULT 0 CHECK ("measurementEpoch">=0);
CREATE FUNCTION measurement_definition_epochs() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE oldj jsonb; newj jsonb; fields text[]; col text; changed boolean;
BEGIN
  newj:=to_jsonb(NEW);
  IF TG_OP='INSERT' THEN
    IF coalesce((newj->>'measurementTargetEpoch')::bigint,0)<>0 OR coalesce((newj->>'measurementPolicyEpoch')::bigint,0)<>0 OR coalesce((newj->>'measurementEpoch')::bigint,0)<>0 THEN RAISE EXCEPTION 'definition_epoch_initial_value'; END IF;
    RETURN NEW;
  END IF;
  oldj:=to_jsonb(OLD);
  FOREACH col IN ARRAY (CASE WHEN TG_TABLE_NAME IN ('projects','keywords') THEN ARRAY['measurementTargetEpoch','measurementPolicyEpoch'] ELSE ARRAY['measurementEpoch'] END) LOOP
    fields:=CASE
      WHEN TG_TABLE_NAME='projects' AND col='measurementTargetEpoch' THEN ARRAY['publicId','domain','trackingScope']
      WHEN TG_TABLE_NAME='projects' THEN ARRAY['measurementPolicyConfig']
      WHEN TG_TABLE_NAME='keywords' AND col='measurementTargetEpoch' THEN ARRAY['publicId','text','device','locationId','location','targetUrl','archivedAt']
      WHEN TG_TABLE_NAME='keywords' THEN ARRAY['checkScheduleId']
      WHEN TG_TABLE_NAME='locations' THEN ARRAY['kind','displayName','countryCode','regionCode','cityName','canonicalKey','gl','hl','languageCode','primaryGeoCode','primaryGeoName','secondaryGeoName']
      ELSE ARRAY['publicId','frequency','cronExpression','timeOfDay','timezone','jitterMinutes','serpDepth','providerPolicy','enabled','archivedAt','isDefault'] END;
    changed:=EXISTS(SELECT 1 FROM unnest(fields) f WHERE oldj->f IS DISTINCT FROM newj->f);
    IF newj->col IS DISTINCT FROM oldj->col THEN
      -- Only a nested schedule/default trigger may conservatively increment its parent policy epoch.
      IF NOT (pg_trigger_depth()>1 AND col='measurementPolicyEpoch' AND (newj->>col)::bigint=(oldj->>col)::bigint+1 AND NOT changed) THEN RAISE EXCEPTION 'definition_epoch_owned'; END IF;
    ELSIF changed THEN
      newj:=jsonb_set(newj,ARRAY[col],to_jsonb((oldj->>col)::bigint+1));
    END IF;
  END LOOP;
  NEW:=jsonb_populate_record(NEW,newj);
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_projects_epochs BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION measurement_definition_epochs();
CREATE TRIGGER measurement_keywords_epochs BEFORE INSERT OR UPDATE ON keywords FOR EACH ROW EXECUTE FUNCTION measurement_definition_epochs();
CREATE TRIGGER measurement_locations_epochs BEFORE INSERT OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION measurement_definition_epochs();
CREATE TRIGGER measurement_check_schedules_epochs BEFORE INSERT OR UPDATE ON check_schedules FOR EACH ROW EXECUTE FUNCTION measurement_definition_epochs();
CREATE FUNCTION measurement_definition_schedule_epoch() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE fields text[]; oldj jsonb; newj jsonb; parent text;
BEGIN
  fields:=CASE WHEN TG_TABLE_NAME='project_defaults' THEN ARRAY['projectId','locationKey','country','city','device','serpDepth','serpStopOnMatch','frequency','cronExpression','timezone','jitterMinutes'] ELSE ARRAY['keywordId','frequency','serpDepth','cronExpression','timezone','jitterMinutes'] END;
  IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM unnest(fields) f WHERE oldj->f IS DISTINCT FROM newj->f) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='project_defaults' THEN
    FOR parent IN SELECT DISTINCT v FROM unnest(ARRAY[oldj->>'projectId',newj->>'projectId']) v WHERE v IS NOT NULL LOOP UPDATE projects SET "measurementPolicyEpoch"="measurementPolicyEpoch"+1 WHERE id=parent; END LOOP;
  ELSE
    FOR parent IN SELECT DISTINCT v FROM unnest(ARRAY[oldj->>'keywordId',newj->>'keywordId']) v WHERE v IS NOT NULL LOOP UPDATE keywords SET "measurementPolicyEpoch"="measurementPolicyEpoch"+1 WHERE id=parent; END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_project_defaults_epoch AFTER INSERT OR UPDATE OR DELETE ON project_defaults FOR EACH ROW EXECUTE FUNCTION measurement_definition_schedule_epoch();
CREATE TRIGGER measurement_keyword_schedules_epoch AFTER INSERT OR UPDATE OR DELETE ON keyword_schedules FOR EACH ROW EXECUTE FUNCTION measurement_definition_schedule_epoch();
CREATE UNIQUE INDEX measurement_check_schedule_project_id ON check_schedules("projectId",id);
ALTER TABLE keywords ADD CONSTRAINT measurement_keyword_schedule_project FOREIGN KEY ("projectId","checkScheduleId") REFERENCES check_schedules("projectId",id) ON DELETE NO ACTION;
-- Existing simple FK SET NULL remains the deletion action; this composite constraint is deferred until its action.
ALTER TABLE keywords ALTER CONSTRAINT measurement_keyword_schedule_project DEFERRABLE INITIALLY DEFERRED;


CREATE FUNCTION measurement_definition_source(project_ref text,keyword_ref text) RETURNS jsonb LANGUAGE sql STABLE SET search_path FROM CURRENT AS $$
SELECT jsonb_build_object(
  'projectId',p.id,'projectPublicId',p."publicId",'keywordId',k.id,'keywordPublicId',k."publicId",
  'epochs',jsonb_build_object('projectTarget',p."measurementTargetEpoch"::text,'projectPolicy',p."measurementPolicyEpoch"::text,'keywordTarget',k."measurementTargetEpoch"::text,'keywordPolicy',k."measurementPolicyEpoch"::text,'location',l."measurementEpoch"::text,'checkSchedule',c."measurementEpoch"::text),
  'target',jsonb_build_object('domain',p.domain,'text',k.text,'targetUrl',k."targetUrl",'device',k.device,'locationId',k."locationId",'keywordLocation',k.location,'archivedAt',k."archivedAt",
    'location',jsonb_build_object('id',l.id,'kind',l.kind,'displayName',l."displayName",'countryCode',l."countryCode",'regionCode',l."regionCode",'cityName',l."cityName",'canonicalKey',l."canonicalKey",'gl',l.gl,'hl',l.hl,'languageCode',l."languageCode",'primaryGeoCode',l."primaryGeoCode",'primaryGeoName',l."primaryGeoName",'secondaryGeoName',l."secondaryGeoName")),
  'policy',jsonb_build_object('config',p."measurementPolicyConfig",
    'defaults',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('frequency',d.frequency,'cronExpression',d."cronExpression",'timezone',d.timezone,'jitterMinutes',d."jitterMinutes",'serpDepth',d."serpDepth",'device',d.device,'locationKey',d."locationKey",'country',d.country,'city',d.city,'serpStopOnMatch',d."serpStopOnMatch") END,
    'keywordSchedule',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'frequency',s.frequency,'cronExpression',s."cronExpression",'timezone',s.timezone,'jitterMinutes',s."jitterMinutes",'serpDepth',s."serpDepth") END,
    'checkSchedule',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'publicId',c."publicId",'projectId',c."projectId",'frequency',c.frequency,'cronExpression',c."cronExpression",'timezone',c.timezone,'jitterMinutes',c."jitterMinutes",'serpDepth',c."serpDepth",'enabled',c.enabled,'archivedAt',c."archivedAt",'providerPolicy',c."providerPolicy",'timeOfDay',c."timeOfDay",'isDefault',c."isDefault") END))
FROM projects p JOIN keywords k ON k."projectId"=p.id JOIN locations l ON l.id=k."locationId"
LEFT JOIN project_defaults d ON d."projectId"=p.id LEFT JOIN keyword_schedules s ON s."keywordId"=k.id
LEFT JOIN check_schedules c ON c.id=k."checkScheduleId" AND c."projectId"=p.id
WHERE p.id=project_ref AND k.id=keyword_ref;
$$;


CREATE TABLE measurement_target_revisions (
  id text PRIMARY KEY, "projectId" text NOT NULL, "keywordId" text NOT NULL,
  source jsonb NOT NULL, epochs jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("projectId","keywordId",id),
  CONSTRAINT measurement_target_keyword_fk FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE
);
CREATE TABLE measurement_policy_revisions (
  id text PRIMARY KEY, "projectId" text NOT NULL, "keywordId" text NOT NULL, "targetRevisionId" text NOT NULL,
  source jsonb NOT NULL, epochs jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("projectId","keywordId","targetRevisionId",id),
  CONSTRAINT measurement_policy_keyword_fk FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_policy_target_fk FOREIGN KEY("projectId","keywordId","targetRevisionId") REFERENCES measurement_target_revisions("projectId","keywordId",id) ON DELETE CASCADE
);
CREATE TABLE measurement_definition_heads (
  "projectId" text NOT NULL, "keywordId" text NOT NULL, "targetRevisionId" text NOT NULL, "policyRevisionId" text NOT NULL,
  generation bigint NOT NULL CHECK(generation>0), epochs jsonb NOT NULL, "sourceFingerprint" text NOT NULL CHECK("sourceFingerprint" ~ '^[0-9a-f]{64}$'), "capturedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY("projectId","keywordId"),
  CONSTRAINT measurement_head_keyword_fk FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_head_policy_fk FOREIGN KEY("projectId","keywordId","targetRevisionId","policyRevisionId") REFERENCES measurement_policy_revisions("projectId","keywordId","targetRevisionId",id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX measurement_rank_check_keyword_id ON rank_checks("keywordId",id);
CREATE UNIQUE INDEX measurement_queued_task_keyword_id ON queued_rank_check_tasks("keywordId",id);
CREATE TABLE measurement_execution_bindings (
  id text PRIMARY KEY, "projectId" text NOT NULL, "keywordId" text NOT NULL, "rankCheckId" text NOT NULL,
  "executionKey" text NOT NULL CHECK(length("executionKey") BETWEEN 1 AND 256), "queuedTaskId" text,
  "targetRevisionId" text NOT NULL, "policyRevisionId" text NOT NULL,
  owner jsonb NOT NULL, request jsonb NOT NULL, source jsonb NOT NULL, "capturedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("projectId",id), UNIQUE("projectId","keywordId","rankCheckId","executionKey"),
  CONSTRAINT measurement_binding_keyword_fk FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_binding_check_fk FOREIGN KEY("keywordId","rankCheckId") REFERENCES rank_checks("keywordId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_binding_queue_fk FOREIGN KEY("keywordId","queuedTaskId") REFERENCES queued_rank_check_tasks("keywordId",id) ON DELETE SET NULL ("queuedTaskId"),
  CONSTRAINT measurement_binding_policy_fk FOREIGN KEY("projectId","keywordId","targetRevisionId","policyRevisionId") REFERENCES measurement_policy_revisions("projectId","keywordId","targetRevisionId",id) ON DELETE CASCADE
);
-- Immutable JSON owner retains queuedTaskId when the operational FK is detached by ordinary task retention.
-- Root must add optional same-project observation_runs.definitionBindingId relation on materialization,
-- leaving every historical row NULL. No reconstruction/backfill from RankCheck mutable metadata.


CREATE FUNCTION measurement_definition_target_epochs(epochs jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
SELECT jsonb_build_object('projectTarget',epochs->'projectTarget','keywordTarget',epochs->'keywordTarget','location',epochs->'location');
$$;
CREATE FUNCTION measurement_definition_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM keywords WHERE id=OLD."keywordId" AND "projectId"=OLD."projectId") THEN RETURN OLD; END IF;
    IF TG_TABLE_NAME='measurement_execution_bindings' AND NOT EXISTS(SELECT 1 FROM rank_checks WHERE id=to_jsonb(OLD)->>'rankCheckId') THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'definition_append_only';
  END IF;
  -- FK-only tombstone on queue retention. All original owner bytes are retained.
  IF TG_TABLE_NAME='measurement_execution_bindings' AND to_jsonb(OLD)->>'queuedTaskId' IS NOT NULL AND to_jsonb(NEW)->>'queuedTaskId' IS NULL
    AND to_jsonb(OLD)-'queuedTaskId'=to_jsonb(NEW)-'queuedTaskId'
    AND NOT EXISTS(SELECT 1 FROM queued_rank_check_tasks WHERE id=to_jsonb(OLD)->>'queuedTaskId') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'definition_append_only';
END $$;
CREATE FUNCTION measurement_definition_revision_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE actual jsonb; target measurement_target_revisions;
BEGIN
  actual:=measurement_definition_source(NEW."projectId",NEW."keywordId");
  IF actual IS NULL OR NEW.epochs IS DISTINCT FROM actual->'epochs' THEN RAISE EXCEPTION 'definition_source_mismatch'; END IF;
  IF TG_TABLE_NAME='measurement_target_revisions' THEN
    IF NEW.source IS DISTINCT FROM actual->'target' THEN RAISE EXCEPTION 'definition_target_mismatch'; END IF;
  ELSE
    IF NEW.source IS DISTINCT FROM actual->'policy' THEN RAISE EXCEPTION 'definition_policy_mismatch'; END IF;
    SELECT * INTO target FROM measurement_target_revisions WHERE id=to_jsonb(NEW)->>'targetRevisionId' AND "projectId"=NEW."projectId" AND "keywordId"=NEW."keywordId";
    IF target.id IS NULL OR target.source IS DISTINCT FROM actual->'target' OR measurement_definition_target_epochs(target.epochs) IS DISTINCT FROM measurement_definition_target_epochs(actual->'epochs') THEN RAISE EXCEPTION 'definition_target_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION measurement_definition_head_write() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE actual jsonb; target measurement_target_revisions; policy measurement_policy_revisions;
BEGIN
  IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM keywords WHERE id=OLD."keywordId" AND "projectId"=OLD."projectId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'definition_head_delete';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW."projectId"<>OLD."projectId" OR NEW."keywordId"<>OLD."keywordId" OR NEW.generation<>OLD.generation+1 THEN RAISE EXCEPTION 'definition_head_cas'; END IF;
  ELSIF NEW.generation<>1 THEN RAISE EXCEPTION 'definition_head_initial'; END IF;
  actual:=measurement_definition_source(NEW."projectId",NEW."keywordId");
  SELECT * INTO target FROM measurement_target_revisions WHERE id=NEW."targetRevisionId";
  SELECT * INTO policy FROM measurement_policy_revisions WHERE id=NEW."policyRevisionId";
  IF actual IS NULL OR NEW.epochs IS DISTINCT FROM actual->'epochs' OR target.source IS DISTINCT FROM actual->'target'
    OR measurement_definition_target_epochs(target.epochs) IS DISTINCT FROM measurement_definition_target_epochs(actual->'epochs')
    OR policy.source IS DISTINCT FROM actual->'policy' OR policy.epochs IS DISTINCT FROM actual->'epochs' THEN RAISE EXCEPTION 'definition_head_stale'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION measurement_definition_binding_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE actual jsonb; head measurement_definition_heads; adapter jsonb; expected jsonb; depth integer;
BEGIN
  actual:=measurement_definition_source(NEW."projectId",NEW."keywordId");
  SELECT * INTO head FROM measurement_definition_heads WHERE "projectId"=NEW."projectId" AND "keywordId"=NEW."keywordId";
  IF actual IS NULL OR NEW.source IS DISTINCT FROM actual OR head."targetRevisionId" IS DISTINCT FROM NEW."targetRevisionId" OR head."policyRevisionId" IS DISTINCT FROM NEW."policyRevisionId" OR head.epochs IS DISTINCT FROM actual->'epochs' THEN RAISE EXCEPTION 'definition_binding_stale'; END IF;
  IF NEW.owner IS DISTINCT FROM jsonb_build_object('rankCheckId',NEW."rankCheckId",'executionKey',NEW."executionKey",'queuedTaskId',NEW."queuedTaskId") THEN RAISE EXCEPTION 'definition_owner_mismatch'; END IF;
  IF NEW."queuedTaskId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM queued_rank_check_tasks q JOIN queued_rank_check_batches b ON b.id=q."batchId" WHERE q.id=NEW."queuedTaskId" AND q."keywordId"=NEW."keywordId" AND q."rankCheckId"=NEW."rankCheckId" AND b."projectId"=NEW."projectId") THEN RAISE EXCEPTION 'definition_queue_owner_mismatch'; END IF;
  IF nullif(btrim(actual#>>'{target,domain}'),'') IS NULL OR lower(btrim(actual#>>'{target,domain}')) ~ '^workspace-[0-9a-f]{4,32}\.bisibility\.cloud$' OR actual#>>'{target,archivedAt}' IS NOT NULL OR actual#>>'{policy,config,forcedAiOverview}' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'definition_unavailable'; END IF;
  SELECT value INTO adapter FROM jsonb_array_elements(actual#>'{policy,config,adapters}') WHERE value->>'providerId'=NEW.request->>'providerId';
  depth:=(NEW.request->>'depth')::integer;
  IF adapter IS NULL OR adapter->>'nativeFindTargetsIn' IS NULL OR adapter->>'nativeFindTargetsIn' NOT IN ('none','with_subdomains_on_match') OR depth NOT IN (10,20,50,100) THEN RAISE EXCEPTION 'definition_adapter_unavailable'; END IF;
  expected:=jsonb_build_object('engine','google','surface','web_serp','resultKind','organic_result','rankScale','organic_group',
    'providerId',adapter->'providerId','capabilityVersion',adapter->'capabilityVersion','adapterVersion',adapter->'adapterVersion','definitionVersion',actual#>'{policy,config,definitionVersion}',
    'keyword',actual#>'{target,text}','device',actual#>'{target,device}','domain',btrim(actual#>>'{target,domain}'),'targetUrl',actual#>'{target,targetUrl}','location',actual#>'{target,location}',
    'depth',depth,'stopOnMatch',coalesce(actual#>'{policy,defaults,serpStopOnMatch}','true'::jsonb),'findTargetsIn',CASE WHEN adapter->>'nativeFindTargetsIn'='with_subdomains_on_match' AND coalesce((actual#>>'{policy,defaults,serpStopOnMatch}')::boolean,true) THEN 'with_subdomains' ELSE NULL END,'forcedAiOverview',false);
  IF NEW.request IS DISTINCT FROM expected THEN RAISE EXCEPTION 'definition_request_mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_target_insert BEFORE INSERT ON measurement_target_revisions FOR EACH ROW EXECUTE FUNCTION measurement_definition_revision_insert();
CREATE TRIGGER measurement_policy_insert BEFORE INSERT ON measurement_policy_revisions FOR EACH ROW EXECUTE FUNCTION measurement_definition_revision_insert();
CREATE TRIGGER measurement_target_immutable BEFORE UPDATE OR DELETE ON measurement_target_revisions FOR EACH ROW EXECUTE FUNCTION measurement_definition_immutable();
CREATE TRIGGER measurement_policy_immutable BEFORE UPDATE OR DELETE ON measurement_policy_revisions FOR EACH ROW EXECUTE FUNCTION measurement_definition_immutable();
CREATE TRIGGER measurement_head_write BEFORE INSERT OR UPDATE OR DELETE ON measurement_definition_heads FOR EACH ROW EXECUTE FUNCTION measurement_definition_head_write();
CREATE TRIGGER measurement_binding_insert BEFORE INSERT ON measurement_execution_bindings FOR EACH ROW EXECUTE FUNCTION measurement_definition_binding_insert();
CREATE TRIGGER measurement_binding_immutable BEFORE UPDATE OR DELETE ON measurement_execution_bindings FOR EACH ROW EXECUTE FUNCTION measurement_definition_immutable();
CREATE FUNCTION measurement_definition_authority_intact() RETURNS boolean LANGUAGE sql STABLE SET search_path FROM CURRENT AS $$
SELECT current_setting('session_replication_role')='origin' AND
 (SELECT count(*)=11 FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND convalidated AND contype='f' AND conname IN ('measurement_keyword_schedule_project','measurement_target_keyword_fk','measurement_policy_keyword_fk','measurement_policy_target_fk','measurement_head_keyword_fk','measurement_head_policy_fk','measurement_binding_keyword_fk','measurement_binding_check_fk','measurement_binding_queue_fk','measurement_binding_policy_fk','measurement_observation_binding_fk')) AND
 (SELECT count(*)=14 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND (tgrelid,tgname) IN (
 (to_regclass('projects'),'measurement_projects_epochs'),(to_regclass('keywords'),'measurement_keywords_epochs'),(to_regclass('locations'),'measurement_locations_epochs'),(to_regclass('check_schedules'),'measurement_check_schedules_epochs'),
 (to_regclass('project_defaults'),'measurement_project_defaults_epoch'),(to_regclass('keyword_schedules'),'measurement_keyword_schedules_epoch'),
 (to_regclass('measurement_target_revisions'),'measurement_target_insert'),(to_regclass('measurement_policy_revisions'),'measurement_policy_insert'),(to_regclass('measurement_target_revisions'),'measurement_target_immutable'),(to_regclass('measurement_policy_revisions'),'measurement_policy_immutable'),
 (to_regclass('measurement_definition_heads'),'measurement_head_write'),(to_regclass('measurement_execution_bindings'),'measurement_binding_insert'),(to_regclass('measurement_execution_bindings'),'measurement_binding_immutable'),(to_regclass('observation_runs'),'measurement_observation_binding')));
$$;

ALTER TABLE observation_runs ADD COLUMN "definitionBindingId" text;
ALTER TABLE observation_runs ADD CONSTRAINT measurement_observation_binding_fk FOREIGN KEY ("projectId","definitionBindingId") REFERENCES measurement_execution_bindings("projectId",id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX measurement_observation_binding_index ON observation_runs("definitionBindingId");
CREATE FUNCTION measurement_observation_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE binding measurement_execution_bindings; neutral_item local_measurement_run_items; neutral_target local_measurement_targets;
  paid_context metering_paid_attempt_context; native_operation metering_operation;
BEGIN
  IF TG_OP='UPDATE' AND NEW."definitionBindingId" IS DISTINCT FROM OLD."definitionBindingId" THEN RAISE EXCEPTION 'definition_observation_binding_immutable'; END IF;
  IF TG_OP='UPDATE' AND ((OLD."neutralExecutionItemId" IS NOT NULL AND OLD.surface='web_serp')
      OR (NEW."neutralExecutionItemId" IS NOT NULL AND NEW.surface='web_serp'))
    AND (NEW."neutralExecutionItemId" IS DISTINCT FROM OLD."neutralExecutionItemId" OR NEW.surface IS DISTINCT FROM OLD.surface)
    THEN RAISE EXCEPTION 'neutral_observation_binding_immutable'; END IF;
  IF NEW."definitionBindingId" IS NULL THEN
    -- Neutral point execution tokens are distinct from immutable RankCheck definition revision IDs.
    IF NEW.surface='web_serp' AND NEW."neutralExecutionItemId" IS NOT NULL THEN
      SELECT * INTO neutral_item FROM local_measurement_run_items WHERE id=NEW."neutralExecutionItemId" AND "projectId"=NEW."projectId";
      SELECT * INTO neutral_target FROM local_measurement_targets WHERE id=neutral_item."targetId" AND "projectId"=NEW."projectId";
      SELECT * INTO paid_context FROM metering_paid_attempt_context WHERE namespace=neutral_item.namespace AND operation_id=neutral_item."preparedAttemptId";
      SELECT * INTO native_operation FROM metering_operation WHERE namespace=neutral_item.namespace AND operation_id=neutral_item."preparedAttemptId";
      IF NEW."rankCheckId" IS NOT NULL OR neutral_item.id IS NULL OR neutral_target.id IS NULL OR paid_context.operation_id IS NULL OR native_operation.operation_id IS NULL
        OR paid_context.principal IS DISTINCT FROM native_operation.principal OR paid_context.fenced_at IS NULL
        OR paid_context.dispatch_lease_id IS DISTINCT FROM neutral_item."preparedLeaseId"
        OR paid_context.context->>'projectId' IS DISTINCT FROM NEW."projectId" OR paid_context.context->>'connectionId' IS DISTINCT FROM neutral_item."connectionId"
        OR paid_context.context->>'providerCredentialVersion' IS DISTINCT FROM neutral_item."credentialVersion"
        OR paid_context.context->>'feature' IS DISTINCT FROM 'local_scan' OR paid_context.context->>'correlationId' IS DISTINCT FROM neutral_item."correlationId"
        OR native_operation.input->'scope'->>'group' IS DISTINCT FROM NEW."projectId" OR native_operation.input->'scope'->>'connection' IS DISTINCT FROM neutral_item."connectionId"
        OR native_operation.input->>'provider' IS DISTINCT FROM NEW.provider OR NEW.provider IS DISTINCT FROM neutral_item.provider
        OR NEW.surface IS DISTINCT FROM neutral_target.target->>'surface' OR NEW.engine IS DISTINCT FROM neutral_target.target->>'engine'
        OR NEW."configuredScope"->>'device' IS DISTINCT FROM neutral_target.target->>'device'
        OR NEW."configuredScope"->>'language' IS DISTINCT FROM neutral_target.target->>'language'
        OR neutral_item.record->>'attemptId' IS DISTINCT FROM neutral_item."preparedAttemptId"
        OR neutral_item.record->'settlementRecorded' IS DISTINCT FROM 'true'::jsonb
        OR NEW."requestPolicy"->'depth' IS DISTINCT FROM neutral_target.target->'cutoff'
        OR NEW."requestPolicy"#>'{evidence,version}' IS DISTINCT FROM '1'::jsonb
        OR NEW."requestPolicy"#>>'{evidence,adapterVersion}' IS DISTINCT FROM neutral_item.record->>'adapterVersion'
        OR NEW."requestPolicy"#>>'{evidence,targetRevision}' IS DISTINCT FROM neutral_target."targetKey"
        OR NEW."requestPolicy"#>>'{evidence,targetRevision}' IS DISTINCT FROM neutral_item.record->>'targetKey'
        OR NEW."requestPolicy"#>>'{evidence,policyRevision}' IS DISTINCT FROM neutral_target.target->>'policyRevision'
        OR NEW."requestPolicy"#>'{localExecution,version}' IS DISTINCT FROM '1'::jsonb
        OR NEW."requestPolicy"#>>'{localExecution,operationKey}' IS DISTINCT FROM neutral_item."operationKey"
        OR NEW."requestPolicy"#>>'{localExecution,targetKey}' IS DISTINCT FROM neutral_target."targetKey"
      THEN RAISE EXCEPTION 'neutral_observation_binding_mismatch'; END IF;
      RETURN NEW;
    END IF;
    IF NEW.surface='web_serp' AND (NEW."requestPolicy"#>>'{evidence,targetRevision}' IS NOT NULL OR NEW."requestPolicy"#>>'{evidence,policyRevision}' IS NOT NULL) THEN
      IF TG_OP='INSERT' THEN RAISE EXCEPTION 'definition_unbound_revisions'; END IF;
      IF NEW."requestPolicy"#>'{evidence,targetRevision}' IS DISTINCT FROM OLD."requestPolicy"#>'{evidence,targetRevision}' OR NEW."requestPolicy"#>'{evidence,policyRevision}' IS DISTINCT FROM OLD."requestPolicy"#>'{evidence,policyRevision}' THEN RAISE EXCEPTION 'definition_unbound_revisions'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO binding FROM measurement_execution_bindings WHERE id=NEW."definitionBindingId" AND "projectId"=NEW."projectId";
  IF binding.id IS NULL OR NEW."rankCheckId" IS DISTINCT FROM binding."rankCheckId" OR NEW."neutralExecutionItemId" IS NOT NULL OR NEW.surface<>'web_serp' OR NEW.engine<>'google' OR NEW.provider IS DISTINCT FROM binding.request->>'providerId'
    OR NEW."configuredScope" IS DISTINCT FROM jsonb_build_object('location',binding.source#>'{target,location,primaryGeoName}','language',binding.source#>'{target,location,hl}','device',binding.source#>'{target,device}')
    OR NEW."requestPolicy"#>>'{evidence,targetRevision}' IS DISTINCT FROM binding."targetRevisionId" OR NEW."requestPolicy"#>>'{evidence,policyRevision}' IS DISTINCT FROM binding."policyRevisionId"
    OR NEW."requestPolicy"->'depth' IS DISTINCT FROM binding.request->'depth'
    OR NEW."requestPolicy"->'stopOnMatch' IS DISTINCT FROM binding.request->'stopOnMatch'
    OR coalesce(NEW."requestPolicy"->'findTargetsIn','null'::jsonb) IS DISTINCT FROM binding.request->'findTargetsIn'
    OR NEW."requestPolicy"->'forcedAiOverview' IS DISTINCT FROM binding.request->'forcedAiOverview'
    OR NEW."requestPolicy"#>>'{evidence,adapterVersion}' IS DISTINCT FROM binding.request->>'adapterVersion' THEN RAISE EXCEPTION 'definition_observation_binding_mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_observation_binding BEFORE INSERT OR UPDATE ON observation_runs FOR EACH ROW EXECUTE FUNCTION measurement_observation_binding_guard();
