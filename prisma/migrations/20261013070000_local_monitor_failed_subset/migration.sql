-- Retry is a new paid occurrence, retaining its original scope and native terminal proof snapshot.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
ALTER TABLE local_monitor_launch_intents ADD CONSTRAINT local_monitor_launch_project_id UNIQUE("projectId",id);
ALTER TABLE local_monitor_occurrences ADD CONSTRAINT local_monitor_occurrence_project_id UNIQUE("projectId",id);
CREATE TABLE local_monitor_retry_selections (
 id text PRIMARY KEY,"projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 "monitorId" text NOT NULL,"parentRunId" text NOT NULL,"parentOccurrenceId" text NOT NULL,
 "definitionRevisionId" text NOT NULL,"scheduleIntentId" text NOT NULL,
 "parentExpectedCount" integer NOT NULL CHECK("parentExpectedCount" BETWEEN 1 AND 100),
 "sourceHash" text NOT NULL CHECK("sourceHash" ~ '^[a-f0-9]{64}$'),
 "selectedProofHash" text NOT NULL CHECK("selectedProofHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("projectId",id),
 FOREIGN KEY("projectId",id) REFERENCES local_monitor_launch_intents("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("projectId","monitorId") REFERENCES local_monitors("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("projectId","parentRunId") REFERENCES local_measurement_runs("projectId",id),
 FOREIGN KEY("projectId","parentOccurrenceId") REFERENCES local_monitor_occurrences("projectId",id),
 FOREIGN KEY("projectId","definitionRevisionId") REFERENCES local_monitor_revisions("projectId",id),
 FOREIGN KEY("projectId","monitorId","scheduleIntentId") REFERENCES local_monitor_schedule_intents("projectId","monitorId",id)
);
CREATE TABLE local_monitor_retry_members (
 "selectionId" text NOT NULL,"projectId" text NOT NULL,"parentItemId" text NOT NULL,
 "targetId" text NOT NULL,"targetKey" text NOT NULL,"recordVersion" integer NOT NULL CHECK("recordVersion">=0),
 "recordSnapshot" jsonb NOT NULL,"nativeState" text NOT NULL CHECK("nativeState" IN ('settled','released')),
 "nativeProof" text NOT NULL CHECK("nativeProof" IN ('proven_rejected','proven_unsent')),
 PRIMARY KEY("selectionId","targetId"),UNIQUE("selectionId","parentItemId"),
 FOREIGN KEY("projectId","selectionId") REFERENCES local_monitor_retry_selections("projectId",id) ON DELETE CASCADE,
 FOREIGN KEY("projectId","parentItemId") REFERENCES local_measurement_run_items("projectId",id),
 FOREIGN KEY("projectId","targetId") REFERENCES local_measurement_targets("projectId",id),
 CHECK(jsonb_typeof("recordSnapshot")='object' AND octet_length("recordSnapshot"::text)<=131072)
);
CREATE FUNCTION local_monitor_retry_immutable_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Immutable monitor retry authority changed';
END $$;
CREATE TRIGGER local_monitor_retry_immutable BEFORE UPDATE OR DELETE ON local_monitor_retry_selections FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_immutable_guard();
CREATE TRIGGER local_monitor_retry_member_immutable BEFORE UPDATE OR DELETE ON local_monitor_retry_members FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_immutable_guard();
CREATE FUNCTION local_monitor_retry_member_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE original local_measurement_run_items%ROWTYPE; selection local_monitor_retry_selections%ROWTYPE;
BEGIN
 SELECT * INTO STRICT selection FROM local_monitor_retry_selections WHERE id=NEW."selectionId" AND "projectId"=NEW."projectId";
 SELECT * INTO STRICT original FROM local_measurement_run_items WHERE id=NEW."parentItemId" AND "projectId"=NEW."projectId";
 IF original."runId"<>selection."parentRunId" OR original."targetId"<>NEW."targetId" OR original.version<>NEW."recordVersion" OR original.record<>NEW."recordSnapshot"
  OR NOT EXISTS(SELECT 1 FROM local_measurement_targets t WHERE t.id=NEW."targetId" AND t."projectId"=NEW."projectId" AND t."targetKey"=NEW."targetKey")
  OR (NEW."recordSnapshot"->>'status') IS NULL OR (NEW."recordSnapshot"->>'targetKey') IS DISTINCT FROM NEW."targetKey"
  OR (NEW."recordSnapshot"->>'version') IS NULL OR (NEW."recordSnapshot"->>'version')::integer<>NEW."recordVersion"
 THEN RAISE EXCEPTION 'Monitor retry original item mismatch'; END IF;
 IF NEW."nativeProof"='proven_rejected' THEN
  IF NEW."nativeState"<>'settled' OR NEW."recordSnapshot"->>'status'<>'rejected'
   OR (NEW."recordSnapshot"->>'settlementRecorded') IS DISTINCT FROM 'true'
   OR (NEW."recordSnapshot"#>>'{outcome,acceptance}') IS DISTINCT FROM 'rejected'
   OR jsonb_typeof(NEW."recordSnapshot"#>'{outcome,taskIds}') IS DISTINCT FROM 'array'
   OR jsonb_array_length(NEW."recordSnapshot"#>'{outcome,taskIds}')<>0
  THEN RAISE EXCEPTION 'Monitor retry rejection proof mismatch'; END IF;
 ELSE
  IF NEW."recordSnapshot"->>'status'<>'cancelled' OR NEW."recordSnapshot"->'outcome' IS DISTINCT FROM 'null'::jsonb
   OR NEW."recordSnapshot"->>'settlementRecorded' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Monitor retry unsent proof mismatch'; END IF;
 END IF;
 IF jsonb_path_exists(NEW."recordSnapshot", '$.originalOutcome.taskIds[*]')
  OR jsonb_path_exists(NEW."recordSnapshot", '$.reconciliationHistory[*].outcome.taskIds[*]')
  OR COALESCE(NEW."recordSnapshot"->'pendingReconciliationReason','null'::jsonb)<>'null'::jsonb
  OR EXISTS(SELECT 1 FROM local_measurement_target_owners o WHERE o."projectId"=NEW."projectId" AND o."itemId"=NEW."parentItemId")
 THEN RAISE EXCEPTION 'Monitor retry original acceptance or owner unresolved'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER local_monitor_retry_member_binding BEFORE INSERT ON local_monitor_retry_members FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_member_guard();
CREATE FUNCTION local_monitor_retry_selection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selection local_monitor_retry_selections%ROWTYPE; job local_monitor_launch_intents%ROWTYPE; parent local_measurement_runs%ROWTYPE; occurrence local_monitor_occurrences%ROWTYPE; retry jsonb; selected_ids text[]; selected_keys text[];
BEGIN
 IF TG_TABLE_NAME='local_monitor_retry_members' THEN SELECT * INTO selection FROM local_monitor_retry_selections WHERE id=NEW."selectionId";
 ELSE SELECT * INTO selection FROM local_monitor_retry_selections WHERE id=NEW.id; END IF;
 IF NOT FOUND THEN
  IF TG_TABLE_NAME='local_monitor_launch_intents' THEN
   IF NEW.command ? 'retry' THEN RAISE EXCEPTION 'Missing immutable monitor retry authority'; END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO STRICT job FROM local_monitor_launch_intents WHERE id=selection.id AND "projectId"=selection."projectId";
 SELECT * INTO STRICT parent FROM local_measurement_runs WHERE id=selection."parentRunId" AND "projectId"=selection."projectId";
 SELECT * INTO STRICT occurrence FROM local_monitor_occurrences WHERE id=selection."parentOccurrenceId" AND "projectId"=selection."projectId";
 retry:=job.command->'retry';
 SELECT array_agg(t."publicId" ORDER BY t."publicId" COLLATE "C"),array_agg(m."targetKey" ORDER BY m."targetKey" COLLATE "C") INTO selected_ids,selected_keys
 FROM local_monitor_retry_members m JOIN local_measurement_targets t ON t.id=m."targetId" AND t."projectId"=m."projectId" WHERE m."selectionId"=selection.id;
 IF job.origin<>'manual' OR job."monitorId"<>selection."monitorId" OR occurrence."monitorId"<>selection."monitorId" OR occurrence."runId"<>parent.id
  OR occurrence."definitionRevisionId"<>selection."definitionRevisionId" OR occurrence."scheduleIntentId"<>selection."scheduleIntentId"
  OR occurrence."createdAt">selection."createdAt" OR job."approvedAt"<>selection."createdAt"
  OR cardinality(parent."expectedTargetKeys")<>selection."parentExpectedCount"
  OR jsonb_typeof(retry) IS DISTINCT FROM 'object' OR retry->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(retry->'parentExpectedCount') IS DISTINCT FROM 'number'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['parentRunId','sourceHash','selectedProofHash']) AS required(field) WHERE jsonb_typeof(retry->required.field) IS DISTINCT FROM 'string')
  OR retry->>'parentRunId' IS DISTINCT FROM parent."publicId" OR retry->>'sourceHash' IS DISTINCT FROM selection."sourceHash"
  OR retry->>'selectedProofHash' IS DISTINCT FROM selection."selectedProofHash"
  OR retry->>'parentExpectedCount' IS NULL OR (retry->>'parentExpectedCount')::integer<>selection."parentExpectedCount"
  OR job.command->>'revisionId' IS DISTINCT FROM selection."definitionRevisionId" OR job.command->>'scheduleIntentId' IS DISTINCT FROM selection."scheduleIntentId"
  OR selected_ids IS NULL OR cardinality(selected_ids) NOT BETWEEN 1 AND selection."parentExpectedCount"
  OR retry->'targetIds' IS DISTINCT FROM to_jsonb(selected_ids) OR job.command->'targetIds' IS DISTINCT FROM to_jsonb(selected_ids)
  OR NOT (selected_keys <@ parent."expectedTargetKeys")
 THEN RAISE EXCEPTION 'Monitor retry frozen selection mismatch'; END IF;
 IF job."runId" IS NOT NULL AND (job."runId"=parent.id OR NOT EXISTS(
  SELECT 1 FROM local_measurement_runs r JOIN local_monitor_occurrences o ON o."projectId"=r."projectId" AND o."runId"=r.id
  WHERE r.id=job."runId" AND r."projectId"=selection."projectId" AND o."definitionRevisionId"=selection."definitionRevisionId"
   AND o."scheduleIntentId"=selection."scheduleIntentId" AND cardinality(r."expectedTargetKeys")=cardinality(selected_keys)
   AND r."expectedTargetKeys" @> selected_keys AND r."expectedTargetKeys" <@ selected_keys))
 THEN RAISE EXCEPTION 'Monitor retry child run mismatch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER local_monitor_retry_selection_binding AFTER INSERT ON local_monitor_retry_selections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_selection_guard();
CREATE CONSTRAINT TRIGGER local_monitor_retry_members_binding AFTER INSERT ON local_monitor_retry_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_selection_guard();
CREATE CONSTRAINT TRIGGER local_monitor_retry_child_binding AFTER INSERT OR UPDATE ON local_monitor_launch_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION local_monitor_retry_selection_guard();
