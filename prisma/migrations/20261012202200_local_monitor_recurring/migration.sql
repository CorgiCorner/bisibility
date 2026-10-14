-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Additive, default-off authority. No backfill, scheduler activation or provider work.
CREATE TABLE local_monitor_recurring_approvals (
 id text PRIMARY KEY,"projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "monitorId" text NOT NULL,"scheduleIntentId" text NOT NULL UNIQUE,"definitionRevisionId" text NOT NULL,"monitorVersion" integer NOT NULL CHECK("monitorVersion">0),
 "actorId" text REFERENCES users(id) ON DELETE SET NULL,snapshot jsonb NOT NULL,
 "contentHash" text NOT NULL CHECK("contentHash" ~ '^[a-f0-9]{64}$'),"approvalDigest" text NOT NULL CHECK("approvalDigest" ~ '^[a-f0-9]{64}$'),
 "approvedAt" timestamp(3) NOT NULL,"validUntil" timestamp(3) NOT NULL CHECK("validUntil">"approvedAt"),
 UNIQUE("projectId",id),FOREIGN KEY("projectId","monitorId","scheduleIntentId") REFERENCES local_monitor_schedule_intents("projectId","monitorId",id),
 FOREIGN KEY("projectId","monitorId","definitionRevisionId") REFERENCES local_monitor_revisions("projectId","monitorId",id),
 CHECK(jsonb_typeof(snapshot)='object' AND NOT(snapshot ? 'consentToken') AND octet_length(snapshot::text)<=131072)
);
CREATE TRIGGER immutable_recurring_approval BEFORE UPDATE OR DELETE ON local_monitor_recurring_approvals FOR EACH ROW EXECUTE FUNCTION local_monitor_history_guard();
CREATE FUNCTION local_monitor_recurring_approval_binding() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM local_monitor_schedule_intents s JOIN local_monitor_revisions d ON d.id=s."definitionRevisionId" AND d."projectId"=s."projectId"
  WHERE s.id=NEW."scheduleIntentId" AND s."projectId"=NEW."projectId" AND s."monitorId"=NEW."monitorId" AND s.mode='scheduled'
  AND s."definitionRevisionId"=NEW."definitionRevisionId" AND s."approvalDigest"=NEW."approvalDigest" AND s."actorId" IS NOT DISTINCT FROM NEW."actorId"
  AND s.snapshot=NEW.snapshot->'calendar' AND d."contentHash"=NEW.snapshot->>'definitionHash'
  AND s."capabilityVersion"=NEW.snapshot->'quote'->>'capabilityVersion') THEN RAISE EXCEPTION 'Recurring schedule authority binding mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bind_recurring_approval BEFORE INSERT ON local_monitor_recurring_approvals FOR EACH ROW EXECUTE FUNCTION local_monitor_recurring_approval_binding();
CREATE TABLE local_monitor_recurring_cursors (
 "approvalId" text PRIMARY KEY,"projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "nextOccurrenceKey" text NOT NULL CHECK(length("nextOccurrenceKey") BETWEEN 1 AND 128),"nextDueAt" timestamp(3) NOT NULL,
 "lastOccurrenceKey" text,"lastOutcome" text CHECK("lastOutcome" IN ('queued','skipped')),
 "usedCents" numeric(60,18) NOT NULL DEFAULT 0 CHECK("usedCents">=0),"issuedOccurrences" integer NOT NULL DEFAULT 0 CHECK("issuedOccurrences">=0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','blocked','finished')),reason text,
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("projectId","approvalId") REFERENCES local_monitor_recurring_approvals("projectId",id) ON DELETE CASCADE
);
CREATE INDEX local_monitor_recurring_due ON local_monitor_recurring_cursors(state,"nextDueAt","approvalId");
ALTER TABLE local_monitor_launch_intents ADD COLUMN origin text NOT NULL DEFAULT 'manual',ADD COLUMN "recurringApprovalId" text,ADD COLUMN "recurringOccurrenceKey" text,
 ADD CONSTRAINT local_monitor_launch_origin CHECK((origin='manual' AND "recurringApprovalId" IS NULL AND "recurringOccurrenceKey" IS NULL) OR (origin='scheduled' AND "recurringApprovalId" IS NOT NULL AND length("recurringOccurrenceKey") BETWEEN 1 AND 128)),
 ADD CONSTRAINT local_monitor_launch_recurring_approval FOREIGN KEY("projectId","recurringApprovalId") REFERENCES local_monitor_recurring_approvals("projectId",id);
ALTER TABLE local_monitor_occurrences DROP CONSTRAINT local_monitor_occurrences_mode_check,ADD CONSTRAINT local_monitor_occurrences_mode_check CHECK(mode IN ('manual','scheduled'));
CREATE OR REPLACE FUNCTION local_monitor_occurrence_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM local_monitor_schedule_intents s WHERE s.id=NEW."scheduleIntentId" AND s."projectId"=NEW."projectId" AND s."monitorId"=NEW."monitorId" AND s."definitionRevisionId"=NEW."definitionRevisionId") OR
 NOT EXISTS(SELECT 1 FROM local_measurement_runs r WHERE r.id=NEW."runId" AND r."projectId"=NEW."projectId" AND r."trigger"=NEW.mode AND r."actorId" IS NOT DISTINCT FROM NEW."actorId" AND r."quoteHash"=NEW."quoteHash") THEN RAISE EXCEPTION 'Monitor occurrence binding mismatch'; END IF;
 IF NEW.mode='scheduled' AND NOT EXISTS(SELECT 1 FROM local_monitor_launch_intents j JOIN local_monitor_recurring_approvals a ON a.id=j."recurringApprovalId" AND a."projectId"=j."projectId"
  WHERE j.origin='scheduled' AND j."projectId"=NEW."projectId" AND j."monitorId"=NEW."monitorId" AND j."keyHash"=NEW."keyHash" AND j."bodyHash"=NEW."bodyHash" AND j."actorId" IS NOT DISTINCT FROM NEW."actorId"
  AND a."scheduleIntentId"=NEW."scheduleIntentId" AND a."definitionRevisionId"=NEW."definitionRevisionId" AND a."approvalDigest"=j."consentDigest") THEN RAISE EXCEPTION 'Scheduled occurrence lacks retained approval'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION local_monitor_recurring_cursor_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE approval local_monitor_recurring_approvals; amount numeric;
BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RAISE EXCEPTION 'Recurring history is retained'; END IF;RETURN OLD; END IF;
 IF NEW."approvalId"<>OLD."approvalId" OR NEW."projectId"<>OLD."projectId" OR NEW."createdAt"<>OLD."createdAt" OR NEW.version<>OLD.version+1 OR NEW."usedCents"<OLD."usedCents" OR NEW."issuedOccurrences" NOT IN (OLD."issuedOccurrences",OLD."issuedOccurrences"+1) THEN RAISE EXCEPTION 'Recurring cursor authority changed'; END IF;
 SELECT * INTO STRICT approval FROM local_monitor_recurring_approvals WHERE id=NEW."approvalId" AND "projectId"=NEW."projectId";
 IF NEW."usedCents">(approval.snapshot->>'maximumTotalCents')::numeric OR NEW."issuedOccurrences">(approval.snapshot->>'maximumOccurrences')::integer THEN RAISE EXCEPTION 'Recurring total ceiling exceeded'; END IF;
 IF NEW."issuedOccurrences"=OLD."issuedOccurrences"+1 THEN
  SELECT (v.value->>'amount')::numeric INTO STRICT amount FROM local_monitor_launch_intents j CROSS JOIN LATERAL jsonb_array_elements(j.command->'quote'->'nativeEstimates') v(value)
   WHERE j."recurringApprovalId"=approval.id AND j.origin='scheduled' AND j."recurringOccurrenceKey"=OLD."nextOccurrenceKey" AND v.value->>'unit'='cents';
  IF amount IS NULL OR amount>(approval.snapshot->>'maximumPerOccurrenceCents')::numeric OR NEW."usedCents"<>OLD."usedCents"+amount THEN RAISE EXCEPTION 'Recurring issued quote ceiling changed'; END IF;
 ELSIF NEW."usedCents"<>OLD."usedCents" THEN RAISE EXCEPTION 'Recurring ceiling may advance only with an original job'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_recurring_cursor BEFORE UPDATE OR DELETE ON local_monitor_recurring_cursors FOR EACH ROW EXECUTE FUNCTION local_monitor_recurring_cursor_guard();
