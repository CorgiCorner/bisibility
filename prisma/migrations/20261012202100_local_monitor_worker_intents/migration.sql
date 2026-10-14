-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
CREATE TABLE local_monitor_launch_intents (
 id text PRIMARY KEY,"publicId" text NOT NULL UNIQUE CHECK ("publicId" ~ '^lmj_[a-z][a-z0-9]{23}$'),
 "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"monitorId" text NOT NULL,
 "actorId" text REFERENCES users(id) ON DELETE SET NULL,command jsonb NOT NULL,
 "bodyHash" text NOT NULL CHECK ("bodyHash" ~ '^[a-f0-9]{64}$'),"keyHash" text NOT NULL CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
 "connectionStamp" text NOT NULL CHECK ("connectionStamp" ~ '^[a-f0-9]{64}$'),"consentDigest" text NOT NULL CHECK ("consentDigest" ~ '^[a-f0-9]{64}$'),
 "approvedAt" timestamp(3) NOT NULL,"expiresAt" timestamp(3) NOT NULL,"collectionDeadline" timestamp(3) NOT NULL,"pollIntervalMs" integer NOT NULL CHECK ("pollIntervalMs" BETWEEN 30000 AND 300000),
 "runId" text,state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','blocked','complete')),
 reason text CHECK(reason IN ('expired','access_revoked','source_changed','admission_refused','provider_evidence_required','interrupted_before_dispatch','unavailable')),
 "leaseToken" text,"leaseVersion" integer NOT NULL DEFAULT 0 CHECK("leaseVersion">=0),"leaseExpiresAt" timestamp(3),version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("projectId","keyHash"),FOREIGN KEY("projectId","monitorId") REFERENCES local_monitors("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("projectId","runId") REFERENCES local_measurement_runs("projectId",id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(jsonb_typeof(command)='object' AND NOT (command ? 'consentToken') AND octet_length(command::text)<=131072),
 CHECK("expiresAt">"approvedAt" AND "collectionDeadline">"approvedAt"),CHECK(("leaseToken" IS NULL)=("leaseExpiresAt" IS NULL)),
 CHECK(state<>'complete' OR "runId" IS NOT NULL)
);
CREATE INDEX local_monitor_launch_intents_pending ON local_monitor_launch_intents(state,"leaseExpiresAt","createdAt");
CREATE INDEX local_monitor_launch_intents_history ON local_monitor_launch_intents("projectId","monitorId","createdAt",id);
CREATE FUNCTION local_monitor_launch_intent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RAISE EXCEPTION 'Monitor launch intents are retained'; END IF; RETURN OLD;
 END IF;
 IF NEW."actorId" IS NULL AND OLD."actorId" IS NOT NULL AND to_jsonb(NEW)-'actorId'=to_jsonb(OLD)-'actorId'
   AND NOT EXISTS(SELECT 1 FROM users WHERE id=OLD."actorId") THEN RETURN NEW; END IF;
 IF to_jsonb(NEW)-ARRAY['runId','state','reason','leaseToken','leaseVersion','leaseExpiresAt','version','updatedAt']<>to_jsonb(OLD)-ARRAY['runId','state','reason','leaseToken','leaseVersion','leaseExpiresAt','version','updatedAt']
   OR NEW.version<>OLD.version+1 OR (OLD."runId" IS NOT NULL AND NEW."runId" IS DISTINCT FROM OLD."runId") THEN RAISE EXCEPTION 'Immutable monitor launch authority changed'; END IF;
 IF NEW."runId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM local_monitor_occurrences o WHERE o."projectId"=NEW."projectId" AND o."monitorId"=NEW."monitorId" AND o."runId"=NEW."runId" AND o."keyHash"=NEW."keyHash" AND o."bodyHash"=NEW."bodyHash") THEN RAISE EXCEPTION 'Monitor launch run binding changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_monitor_launch_authority BEFORE UPDATE OR DELETE ON local_monitor_launch_intents FOR EACH ROW EXECUTE FUNCTION local_monitor_launch_intent_guard();
