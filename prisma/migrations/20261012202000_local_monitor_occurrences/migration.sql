-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Additive manual-launch authority; no legacy backfill, paid work or schedule enablement.
CREATE TABLE local_monitor_occurrences (
 id text PRIMARY KEY,
 "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "monitorId" text NOT NULL,
 "definitionRevisionId" text NOT NULL,
 "scheduleIntentId" text NOT NULL,
 "monitorVersion" integer NOT NULL CHECK ("monitorVersion" >= 0),
 "actorId" text REFERENCES users(id) ON DELETE SET NULL,
 mode text NOT NULL CHECK (mode = 'manual'),
 "keyHash" text NOT NULL CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
 "bodyHash" text NOT NULL CHECK ("bodyHash" ~ '^[a-f0-9]{64}$'),
 "quoteHash" text NOT NULL CHECK ("quoteHash" ~ '^local-quote-v1:[a-f0-9]{64}$'),
 "runId" text NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("projectId","keyHash"), UNIQUE ("projectId","runId"),
 FOREIGN KEY ("projectId","monitorId") REFERENCES local_monitors("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY ("projectId","monitorId","definitionRevisionId") REFERENCES local_monitor_revisions("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("projectId","monitorId","scheduleIntentId") REFERENCES local_monitor_schedule_intents("projectId","monitorId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("projectId","runId") REFERENCES local_measurement_runs("projectId",id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX local_monitor_occurrences_history ON local_monitor_occurrences("projectId","monitorId","createdAt",id);
CREATE TRIGGER immutable_monitor_occurrence BEFORE UPDATE OR DELETE ON local_monitor_occurrences
 FOR EACH ROW EXECUTE FUNCTION local_monitor_history_guard();
CREATE FUNCTION local_monitor_occurrence_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM local_monitor_schedule_intents s
   WHERE s.id=NEW."scheduleIntentId" AND s."projectId"=NEW."projectId" AND s."monitorId"=NEW."monitorId"
   AND s."definitionRevisionId"=NEW."definitionRevisionId") OR
   NOT EXISTS(SELECT 1 FROM local_measurement_runs r
   WHERE r.id=NEW."runId" AND r."projectId"=NEW."projectId" AND r."trigger"='manual'
   AND r."actorId" IS NOT DISTINCT FROM NEW."actorId" AND r."quoteHash"=NEW."quoteHash") THEN
  RAISE EXCEPTION 'Monitor occurrence binding mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER complete_monitor_occurrence BEFORE INSERT ON local_monitor_occurrences
 FOR EACH ROW EXECUTE FUNCTION local_monitor_occurrence_binding_guard();
