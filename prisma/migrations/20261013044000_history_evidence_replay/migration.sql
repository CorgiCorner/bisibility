-- Source facts are never a completeness/scope certificate or a financial replay.
CREATE TABLE history_evidence_replay_runs (
 id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "initiatorKind" text NOT NULL CHECK("initiatorKind" IN ('session','database_operator')), "initiatorRef" text NOT NULL,
 "parserVersion" text NOT NULL CHECK("parserVersion"='organic-domain-ranks-replay-v1'), "codeHash" text NOT NULL CHECK("codeHash" ~ '^[a-f0-9]{64}$'),
 "requestHash" text NOT NULL CHECK("requestHash" ~ '^[a-f0-9]{64}$'), request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND request ?& ARRAY['projectId','from','to','maxRows','batchSize'] AND jsonb_typeof(request->'projectId')='string' AND jsonb_typeof(request->'from')='string' AND jsonb_typeof(request->'to')='string' AND jsonb_typeof(request->'maxRows')='number' AND (request->>'maxRows')::numeric BETWEEN 1 AND 10000 AND trunc((request->>'maxRows')::numeric)=(request->>'maxRows')::numeric AND jsonb_typeof(request->'batchSize')='number' AND (request->>'batchSize')::numeric BETWEEN 1 AND 200),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest)<=10000 AND octet_length(manifest::text)<=8388608),
 "manifestHash" text NOT NULL CHECK("manifestHash" ~ '^[a-f0-9]{64}$'), "snapshotAt" timestamptz(3) NOT NULL,
 cursor integer NOT NULL DEFAULT 0 CHECK(cursor>=0), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 applied integer NOT NULL DEFAULT 0 CHECK(applied>=0), excluded integer NOT NULL DEFAULT 0 CHECK(excluded>=0), "projectionPresent" integer NOT NULL DEFAULT 0 CHECK("projectionPresent">=0),
 state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','completed','stopped')),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE("projectId",id), CHECK(cursor<=jsonb_array_length(manifest)), CHECK(cursor=applied+excluded+"projectionPresent"), CHECK(state<>'completed' OR cursor=jsonb_array_length(manifest))
);
CREATE TABLE history_evidence_replay_receipts (
 id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "runId" text NOT NULL, "sourceId" text NOT NULL, "keywordId" text, "rankCheckId" text,
 "sourceHash" text NOT NULL CHECK("sourceHash" ~ '^[a-f0-9]{64}$'), "parserVersion" text NOT NULL, "codeHash" text NOT NULL CHECK("codeHash" ~ '^[a-f0-9]{64}$'),
 "originalCheckedAt" timestamp(3) NOT NULL, "retainedObservedAt" timestamptz(3), "sourceKind" text NOT NULL CHECK("sourceKind" IN ('legacy_root_raw','retained_observation','unavailable')),
 status text NOT NULL CHECK(status IN ('applied','not_completed','projection_present','raw_expired','unrecognized_container','source_too_large','unsupported_provider','invalid_source_id','retained_owner_unavailable','source_missing')),
 "outputHash" text CHECK("outputHash" ~ '^[a-f0-9]{64}$'), "normalizedFacts" jsonb,
 qualification text NOT NULL DEFAULT 'retained_facts_only' CHECK(qualification='retained_facts_only'),
 "recordedAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE("runId","sourceId"),
 FOREIGN KEY("projectId","runId") REFERENCES history_evidence_replay_runs("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("keywordId","rankCheckId") REFERENCES rank_checks("keywordId",id) ON DELETE CASCADE,
 CHECK(("rankCheckId" IS NULL)=("keywordId" IS NULL)),
 CHECK((status='applied' AND "sourceKind" IN ('legacy_root_raw','retained_observation')) OR (status<>'applied' AND "sourceKind"='unavailable')),
 CHECK((status='applied')=("normalizedFacts" IS NOT NULL AND "outputHash" IS NOT NULL)),
 CHECK("normalizedFacts" IS NULL OR (jsonb_typeof("normalizedFacts")='array' AND jsonb_array_length("normalizedFacts")<=100))
);
CREATE FUNCTION history_evidence_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; a integer; e integer; p integer;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.request->>'projectId' IS DISTINCT FROM (SELECT "publicId" FROM projects WHERE id=NEW."projectId") OR NEW.request->>'from' IS NULL OR NEW.request->>'to' IS NULL OR (NEW.request->>'from')::timestamptz>(NEW.request->>'to')::timestamptz OR (NEW.request->>'to')::timestamptz>NEW."snapshotAt" OR NEW."snapshotAt">clock_timestamp() OR jsonb_array_length(NEW.manifest)>(NEW.request->>'maxRows')::integer THEN RAISE EXCEPTION 'evidence_replay_invalid_window'; END IF;
  IF NEW.cursor<>0 OR NEW.revision<>0 OR NEW.applied<>0 OR NEW.excluded<>0 OR NEW."projectionPresent"<>0 OR NEW.state<>'running' THEN RAISE EXCEPTION 'evidence_replay_invalid_initial_state'; END IF;
  SELECT count(*) INTO n FROM jsonb_to_recordset(NEW.manifest) AS s("checkId" text,"checkPublicId" text,"keywordId" text,"keywordPublicId" text,"checkedAtText" text,"createdAtText" text,status text,provider text,"normalizationVersion" text,"requestedDepth" integer,"rawHash" text,"storedHash" text)
   JOIN rank_checks c ON c.id=s."checkId" AND c."keywordId"=s."keywordId" JOIN keywords k ON k.id=c."keywordId"
   WHERE k."projectId"=NEW."projectId" AND c.status=s.status AND c."publicId"=s."checkPublicId" AND k."publicId"=s."keywordPublicId"
    AND c."checkedAt"::text=s."checkedAtText" AND c."createdAt"::text=s."createdAtText" AND c.provider=s.provider
    AND c."normalizationVersion" IS NOT DISTINCT FROM s."normalizationVersion" AND c."requestedDepth" IS NOT DISTINCT FROM s."requestedDepth"
    AND encode(sha256(convert_to(COALESCE(c.raw::text,'#SQL_NULL#'),'UTF8')),'hex')=s."rawHash"
    AND encode(sha256(convert_to(COALESCE(c."organicRanks"::text,'#SQL_NULL#'),'UTF8')),'hex')=s."storedHash"
    AND c."checkedAt">=(NEW.request->>'from')::timestamp AND c."checkedAt"<=(NEW.request->>'to')::timestamp AND c."createdAt"<=NEW."snapshotAt" AT TIME ZONE 'UTC';
  IF n<>(SELECT count(*) FROM rank_checks c JOIN keywords k ON k.id=c."keywordId" WHERE k."projectId"=NEW."projectId" AND c."checkedAt">=(NEW.request->>'from')::timestamp AND c."checkedAt"<=(NEW.request->>'to')::timestamp AND c."createdAt"<=NEW."snapshotAt" AT TIME ZONE 'UTC') OR n<>jsonb_array_length(NEW.manifest) OR n<>(SELECT count(DISTINCT x->>'checkId') FROM jsonb_array_elements(NEW.manifest) x) THEN RAISE EXCEPTION 'evidence_replay_foreign_manifest'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['cursor','revision','applied','excluded','projectionPresent','state','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cursor','revision','applied','excluded','projectionPresent','state','updatedAt'])
   OR OLD.state<>'running' OR NEW.revision<>OLD.revision+1 OR NEW.cursor<OLD.cursor OR NEW.applied<OLD.applied OR NEW.excluded<OLD.excluded OR NEW."projectionPresent"<OLD."projectionPresent" OR NEW."updatedAt"<OLD."updatedAt"
   OR (NEW.cursor=OLD.cursor AND (NEW.applied<>OLD.applied OR NEW.excluded<>OLD.excluded OR NEW."projectionPresent"<>OLD."projectionPresent"))
   OR (NEW.cursor=OLD.cursor AND NEW.state<>'stopped' AND NOT (NEW.state='completed' AND NEW.cursor=jsonb_array_length(NEW.manifest))) THEN RAISE EXCEPTION 'evidence_replay_immutable_input'; END IF;
  IF NEW.cursor>OLD.cursor THEN
   SELECT count(*)::integer,count(*) FILTER(WHERE t.status='applied')::integer,count(*) FILTER(WHERE t.status NOT IN ('applied','projection_present'))::integer,count(*) FILTER(WHERE t.status='projection_present')::integer INTO n,a,e,p
   FROM jsonb_array_elements(NEW.manifest) WITH ORDINALITY AS x(value,ordinal) JOIN history_evidence_replay_receipts t ON t."runId"=NEW.id AND t."sourceId"=x.value->>'checkId' WHERE x.ordinal>OLD.cursor AND x.ordinal<=NEW.cursor;
   IF n<>NEW.cursor-OLD.cursor OR a<>NEW.applied-OLD.applied OR e<>NEW.excluded-OLD.excluded OR p<>NEW."projectionPresent"-OLD."projectionPresent" THEN RAISE EXCEPTION 'evidence_replay_checkpoint_receipts'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_evidence_run_guard BEFORE INSERT OR UPDATE ON history_evidence_replay_runs FOR EACH ROW EXECUTE FUNCTION history_evidence_run_guard();
CREATE FUNCTION history_evidence_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r history_evidence_replay_runs; s jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'evidence_replay_receipt_immutable'; END IF;
 SELECT * INTO r FROM history_evidence_replay_runs WHERE id=NEW."runId" AND "projectId"=NEW."projectId";
 SELECT x INTO s FROM jsonb_array_elements(r.manifest) x WHERE x->>'checkId'=NEW."sourceId";
 IF s IS NULL OR r.state<>'running' OR NEW."sourceHash"<>s->>'rawHash' OR NEW."parserVersion"<>r."parserVersion" OR NEW."codeHash"<>r."codeHash" OR NEW."originalCheckedAt"::text<>s->>'checkedAtText'
  OR (NEW."rankCheckId" IS NOT NULL AND (NEW."rankCheckId"<>NEW."sourceId" OR NEW."keywordId"<>s->>'keywordId'))
  OR (NEW."rankCheckId" IS NULL AND NEW.status<>'source_missing') THEN RAISE EXCEPTION 'evidence_replay_receipt_binding'; END IF;
 IF NEW."rankCheckId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rank_checks c WHERE c.id=NEW."rankCheckId" AND c."keywordId"=NEW."keywordId" AND c."checkedAt"=NEW."originalCheckedAt" AND encode(sha256(convert_to(COALESCE(c.raw::text,'#SQL_NULL#'),'UTF8')),'hex')=NEW."sourceHash" AND (NEW.status<>'applied' OR c."organicRanks"=NEW."normalizedFacts")) THEN RAISE EXCEPTION 'evidence_replay_receipt_source'; END IF;
 IF NEW.status='applied' AND (EXISTS(SELECT 1 FROM jsonb_array_elements(NEW."normalizedFacts") f WHERE jsonb_typeof(f)<>'object' OR NOT(f ? 'domain' AND f ? 'position') OR f-ARRAY['domain','position']<>'{}'::jsonb OR jsonb_typeof(f->'domain')<>'string' OR f->>'domain' ~ '[[:space:]]' OR jsonb_typeof(f->'position')<>'number' OR (f->>'position')::numeric<1 OR (f->>'position')::numeric>100 OR trunc((f->>'position')::numeric)<>(f->>'position')::numeric) OR NEW."outputHash"<>encode(sha256(convert_to(regexp_replace(NEW."normalizedFacts"::text,'[[:space:]]','','g'),'UTF8')),'hex')) THEN RAISE EXCEPTION 'evidence_replay_receipt_projection'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_evidence_receipt_guard BEFORE INSERT OR UPDATE ON history_evidence_replay_receipts FOR EACH ROW EXECUTE FUNCTION history_evidence_receipt_guard();
-- Deletion remains ordinary retention/tenant cascade; no blanket DELETE ban.
