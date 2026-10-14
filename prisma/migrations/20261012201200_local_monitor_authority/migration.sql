-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Proposal: apply after existing local execution + measurement-definition migrations.
-- No provider enablement, legacy backfill, scheduler mutation or paid work.
CREATE TABLE local_monitors (
 id text PRIMARY KEY, "publicId" text NOT NULL UNIQUE CONSTRAINT local_monitors_public_id_contract_format CHECK ("publicId" ~ '^lmn_[a-z][a-z0-9]{23}$'),
 "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80), state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0), "currentRevisionId" text, "currentScheduleIntentId" text,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("projectId",id)
);
CREATE INDEX local_monitors_list ON local_monitors("projectId",state,"publicId");
CREATE TABLE local_monitor_revisions (
 id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "monitorId" text NOT NULL, "previousRevisionId" text, revision integer NOT NULL CHECK (revision > 0),
 "entityId" text NOT NULL, "identityRevisionId" text NOT NULL,
 "gridRevisionKey" text NOT NULL, "contentHash" text NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'), snapshot jsonb NOT NULL,
 "actorId" text REFERENCES users(id) ON DELETE SET NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("projectId",id), UNIQUE ("projectId","monitorId",id), UNIQUE ("monitorId",revision),
 FOREIGN KEY ("projectId","monitorId") REFERENCES local_monitors("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY ("projectId","monitorId","previousRevisionId") REFERENCES local_monitor_revisions("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("projectId","entityId","identityRevisionId") REFERENCES business_identity_revisions("projectId","entityId",id) DEFERRABLE INITIALLY DEFERRED,
 CHECK (jsonb_typeof(snapshot)='object' AND coalesce(snapshot->'version'='1'::jsonb,false) AND octet_length(snapshot::text)<=262144),
 CHECK (coalesce(snapshot->>'entityId'="entityId" AND snapshot->>'identityRevisionId'="identityRevisionId" AND
   snapshot#>>'{grid,revisionId}'=id AND snapshot#>>'{grid,revisionKey}'="gridRevisionKey",false))
);
CREATE TABLE local_monitor_grid_points (
 "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, "revisionId" text NOT NULL,
 "pointId" text NOT NULL, ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 48),
 row integer NOT NULL CHECK (row BETWEEN 0 AND 6), "column" integer NOT NULL CHECK ("column" BETWEEN 0 AND 6),
 PRIMARY KEY ("revisionId",ordinal), UNIQUE ("revisionId",row,"column"), UNIQUE ("revisionId","pointId"),
 FOREIGN KEY ("projectId","revisionId") REFERENCES local_monitor_revisions("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY ("projectId","pointId") REFERENCES local_measurement_points("projectId",id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE local_monitor_keywords (
 "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, "revisionId" text NOT NULL,
 "keywordId" text, "keywordPublicId" text NOT NULL CHECK ("keywordPublicId" ~ '^kw_[a-z][a-z0-9]{23}$'),
 ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 19), "sourceHash" text NOT NULL CHECK ("sourceHash" ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY ("revisionId",ordinal), UNIQUE ("revisionId","keywordPublicId"),
 FOREIGN KEY ("projectId","revisionId") REFERENCES local_monitor_revisions("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY ("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE SET NULL ("keywordId")
);
CREATE TABLE local_monitor_schedule_intents (
 id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "monitorId" text NOT NULL, "definitionRevisionId" text NOT NULL, "previousRevisionId" text,
 revision integer NOT NULL CHECK (revision > 0), mode text NOT NULL CHECK (mode IN ('manual','paused','scheduled')),
 "scheduleId" text, snapshot jsonb, "approvalDigest" text, "capabilityVersion" text,
 "actorId" text REFERENCES users(id) ON DELETE SET NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("projectId","monitorId",id), UNIQUE ("monitorId",revision),
 FOREIGN KEY ("projectId","monitorId") REFERENCES local_monitors("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY ("projectId","monitorId","definitionRevisionId") REFERENCES local_monitor_revisions("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("projectId","monitorId","previousRevisionId") REFERENCES local_monitor_schedule_intents("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("projectId","scheduleId") REFERENCES check_schedules("projectId",id) ON DELETE SET NULL ("scheduleId"),
 CHECK (CASE WHEN mode='scheduled' THEN
   snapshot IS NOT NULL AND jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=8192 AND
   "approvalDigest" IS NOT NULL AND "approvalDigest" ~ '^[a-f0-9]{64}$' AND
   "capabilityVersion" IS NOT NULL AND length("capabilityVersion") BETWEEN 1 AND 128 AND
   coalesce(snapshot->>'measurementEpoch' ~ '^(0|[1-9][0-9]*)$' AND length(snapshot->>'timezone')>0 AND
    ("scheduleId" IS NULL OR snapshot->>'scheduleId'="scheduleId"),false)
 ELSE snapshot IS NULL AND "approvalDigest" IS NULL AND "capabilityVersion" IS NULL AND "scheduleId" IS NULL END)
);
CREATE TABLE local_monitor_mutations (
 id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK (operation IN ('create','revise','archive','schedule')),
 "keyHash" text NOT NULL CHECK ("keyHash" ~ '^[a-f0-9]{64}$'), "bodyHash" text NOT NULL CHECK ("bodyHash" ~ '^[a-f0-9]{64}$'),
 "actorId" text REFERENCES users(id) ON DELETE SET NULL, result jsonb NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("projectId",operation,"keyHash")
);
ALTER TABLE local_monitors ADD CONSTRAINT local_monitor_definition_head
 FOREIGN KEY ("projectId",id,"currentRevisionId") REFERENCES local_monitor_revisions("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE local_monitors ADD CONSTRAINT local_monitor_intent_head
 FOREIGN KEY ("projectId",id,"currentScheduleIntentId") REFERENCES local_monitor_schedule_intents("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED;

-- Concatenate with 001 as one atomic migration. Functions are not a second business-authority layer.
CREATE FUNCTION local_monitor_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RAISE EXCEPTION 'Retained monitor history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME='local_monitor_keywords' AND to_jsonb(NEW)->'keywordId'='null'::jsonb AND to_jsonb(OLD)->>'keywordId' IS NOT NULL
  AND to_jsonb(NEW)-'keywordId'=to_jsonb(OLD)-'keywordId'
  AND NOT EXISTS(SELECT 1 FROM keywords WHERE id=to_jsonb(OLD)->>'keywordId') THEN RETURN NEW; END IF;
 IF to_jsonb(NEW) ? 'scheduleId' AND to_jsonb(NEW)->'scheduleId'='null'::jsonb AND to_jsonb(OLD)->>'scheduleId' IS NOT NULL
  AND to_jsonb(NEW)-'scheduleId'=to_jsonb(OLD)-'scheduleId'
  AND NOT EXISTS(SELECT 1 FROM check_schedules WHERE id=to_jsonb(OLD)->>'scheduleId') THEN RETURN NEW; END IF;
 IF to_jsonb(NEW) ? 'actorId' AND to_jsonb(NEW)->'actorId'='null'::jsonb AND to_jsonb(OLD)->>'actorId' IS NOT NULL
  AND to_jsonb(NEW)-'actorId'=to_jsonb(OLD)-'actorId'
  AND NOT EXISTS(SELECT 1 FROM users WHERE id=to_jsonb(OLD)->>'actorId') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Retained monitor history is immutable';
END $$;
CREATE FUNCTION local_monitor_chain_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE previous_id text; previous_revision integer;
BEGIN
 PERFORM 1 FROM local_monitors WHERE id=NEW."monitorId" AND "projectId"=NEW."projectId" FOR UPDATE;
 IF TG_TABLE_NAME='local_monitor_revisions' THEN
  SELECT id,revision INTO previous_id,previous_revision FROM local_monitor_revisions WHERE "monitorId"=NEW."monitorId" ORDER BY revision DESC LIMIT 1;
 ELSE
  SELECT id,revision INTO previous_id,previous_revision FROM local_monitor_schedule_intents WHERE "monitorId"=NEW."monitorId" ORDER BY revision DESC LIMIT 1;
 END IF;
 IF NEW.revision <> coalesce(previous_revision,0)+1 OR NEW."previousRevisionId" IS DISTINCT FROM previous_id THEN
  RAISE EXCEPTION 'Monitor revision must append to its current lineage';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION local_monitor_head_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RAISE EXCEPTION 'Archive monitors instead of deleting'; END IF;
  RETURN OLD;
 END IF;
 IF to_jsonb(NEW)-ARRAY['name','state','version','currentRevisionId','currentScheduleIntentId','updatedAt'] <>
    to_jsonb(OLD)-ARRAY['name','state','version','currentRevisionId','currentScheduleIntentId','updatedAt']
    OR NEW.version<>OLD.version+1 OR OLD.state='archived' THEN RAISE EXCEPTION 'Invalid monitor CAS transition'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION local_monitor_validate_geometry(revision_id text) RETURNS void LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE r local_monitor_revisions; expected jsonb; row_data record; count_points integer; count_keywords integer;
BEGIN
 SELECT * INTO r FROM local_monitor_revisions WHERE id=revision_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF jsonb_typeof(r.snapshot->'name') IS DISTINCT FROM 'string'
   OR jsonb_typeof(r.snapshot#>'{grid,points}') IS DISTINCT FROM 'array'
   OR jsonb_typeof(r.snapshot->'keywords') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Monitor required snapshot fields missing'; END IF;
 count_points := jsonb_array_length(r.snapshot#>'{grid,points}'); count_keywords := jsonb_array_length(r.snapshot->'keywords');
 IF count_points IS NULL OR count_keywords IS NULL OR count_points NOT IN (1,9,25,49) OR count_keywords NOT BETWEEN 1 AND 20 OR count_points*count_keywords>100
   OR count_points<>(SELECT count(*) FROM local_monitor_grid_points WHERE "revisionId"=r.id)
   OR count_keywords<>(SELECT count(*) FROM local_monitor_keywords WHERE "revisionId"=r.id) THEN RAISE EXCEPTION 'Incomplete ordered monitor membership'; END IF;
 IF NOT EXISTS(SELECT 1 FROM business_locations WHERE id=r."entityId" AND "projectId"=r."projectId" AND "publicId"=r.snapshot->>'locationId') THEN RAISE EXCEPTION 'Monitor subject identity mismatch'; END IF;
 FOR row_data IN SELECT g.*,p.point FROM local_monitor_grid_points g JOIN local_measurement_points p
  ON p.id=g."pointId" AND p."projectId"=g."projectId" WHERE g."revisionId"=r.id LOOP
  expected := r.snapshot#>ARRAY['grid','points',row_data.ordinal::text];
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
   OR jsonb_typeof(expected->'ordinal') IS DISTINCT FROM 'number' OR jsonb_typeof(expected->'row') IS DISTINCT FROM 'number'
   OR jsonb_typeof(expected->'column') IS DISTINCT FROM 'number' OR jsonb_typeof(expected->'point') IS DISTINCT FROM 'object'
   OR expected->>'ordinal' IS DISTINCT FROM row_data.ordinal::text OR expected->>'row' IS DISTINCT FROM row_data.row::text
   OR expected->>'column' IS DISTINCT FROM row_data."column"::text OR expected->'point' IS DISTINCT FROM row_data.point THEN RAISE EXCEPTION 'Monitor point order/content mismatch'; END IF;
 END LOOP;
 FOR row_data IN SELECT * FROM local_monitor_keywords WHERE "revisionId"=r.id LOOP
  expected := r.snapshot#>ARRAY['keywords',row_data.ordinal::text];
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
   OR jsonb_typeof(expected->'publicId') IS DISTINCT FROM 'string' OR jsonb_typeof(expected->'sourceHash') IS DISTINCT FROM 'string'
   OR jsonb_typeof(expected->'id') IS DISTINCT FROM 'string'
   OR expected->>'publicId' IS DISTINCT FROM row_data."keywordPublicId" OR expected->>'sourceHash' IS DISTINCT FROM row_data."sourceHash"
   OR (row_data."keywordId" IS NOT NULL AND expected->>'id' IS DISTINCT FROM row_data."keywordId") THEN RAISE EXCEPTION 'Monitor keyword order/content mismatch'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION local_monitor_deferred_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE monitor_id text; m local_monitors; r local_monitor_revisions; s local_monitor_schedule_intents;
BEGIN
 IF TG_TABLE_NAME='local_monitors' THEN monitor_id:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('local_monitor_revisions','local_monitor_schedule_intents') THEN monitor_id:=NEW."monitorId";
 ELSE
  PERFORM local_monitor_validate_geometry(NEW."revisionId"); RETURN NULL;
 END IF;
 SELECT * INTO m FROM local_monitors WHERE id=monitor_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM local_monitor_revisions WHERE id=m."currentRevisionId";
 SELECT * INTO s FROM local_monitor_schedule_intents WHERE id=m."currentScheduleIntentId";
 IF m."currentRevisionId" IS NULL OR m."currentScheduleIntentId" IS NULL OR r.id IS NULL OR s.id IS NULL OR
   r.revision<>(SELECT max(revision) FROM local_monitor_revisions WHERE "monitorId"=m.id) OR
   s.revision<>(SELECT max(revision) FROM local_monitor_schedule_intents WHERE "monitorId"=m.id) OR
   m.name IS DISTINCT FROM r.snapshot->>'name' THEN RAISE EXCEPTION 'Monitor must publish its latest complete heads'; END IF;
 PERFORM local_monitor_validate_geometry(r.id);
 IF TG_TABLE_NAME='local_monitor_revisions' THEN PERFORM local_monitor_validate_geometry(NEW.id); END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['local_monitor_revisions','local_monitor_grid_points','local_monitor_keywords','local_monitor_schedule_intents','local_monitor_mutations'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_monitor_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION local_monitor_history_guard()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['local_monitor_revisions','local_monitor_schedule_intents'] LOOP
  EXECUTE format('CREATE TRIGGER append_monitor_lineage BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION local_monitor_chain_guard()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['local_monitors','local_monitor_revisions','local_monitor_grid_points','local_monitor_keywords','local_monitor_schedule_intents'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER complete_monitor_revision AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION local_monitor_deferred_guard()',t);
 END LOOP;
END $$;
CREATE TRIGGER monitor_cas BEFORE UPDATE OR DELETE ON local_monitors FOR EACH ROW EXECUTE FUNCTION local_monitor_head_guard();
