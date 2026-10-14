-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Bind native worker execution and continuation proofs to original admitted identities.
-- No historical claim, binding, epoch or scope backfill. Runtime passwords/keys never enter these rows.
-- Original authenticated caller identity is minted from server-inserted columns at INSERT, never history.
ALTER TABLE rank_check_runs ADD COLUMN "definitionExecutionOrigin" jsonb;
CREATE FUNCTION measurement_run_origin(r rank_check_runs) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT jsonb_build_object('version',1,'projectId',r."projectId",'actorId',r."requestedById",'source',r.source,'trigger',r.trigger,'credentialKind',r."credentialKind",'credentialId',r."credentialId",'checkScheduleId',r."checkScheduleId");
$$;
CREATE FUNCTION measurement_run_origin_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE expected jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    expected:=measurement_run_origin(NEW);
    IF NEW."definitionExecutionOrigin" IS NOT NULL AND NEW."definitionExecutionOrigin" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'measurement_original_caller_mismatch'; END IF;
    NEW."definitionExecutionOrigin":=expected;
  ELSE
    IF NEW."definitionExecutionOrigin" IS DISTINCT FROM OLD."definitionExecutionOrigin" THEN RAISE EXCEPTION 'measurement_original_caller_immutable'; END IF;
    IF OLD."definitionExecutionOrigin" IS NOT NULL AND (NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW.source IS DISTINCT FROM OLD.source OR NEW.trigger IS DISTINCT FROM OLD.trigger
      OR NEW."credentialKind" IS DISTINCT FROM OLD."credentialKind" OR NEW."credentialId" IS DISTINCT FROM OLD."credentialId"
      OR (NEW."checkScheduleId" IS DISTINCT FROM OLD."checkScheduleId" AND NOT (NEW."checkScheduleId" IS NULL AND NOT EXISTS(SELECT 1 FROM check_schedules WHERE id=OLD."checkScheduleId")))
      OR (NEW."requestedById" IS DISTINCT FROM OLD."requestedById" AND NOT (NEW."requestedById" IS NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=OLD."requestedById"))))
    THEN RAISE EXCEPTION 'measurement_original_caller_columns_immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_run_origin_guard BEFORE INSERT OR UPDATE ON rank_check_runs FOR EACH ROW EXECUTE FUNCTION measurement_run_origin_guard();
ALTER TABLE rank_check_run_items ADD COLUMN "definitionIntent" jsonb;
CREATE FUNCTION measurement_item_intent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE project_ref text; actual jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW."definitionIntent" IS DISTINCT FROM OLD."definitionIntent" THEN RAISE EXCEPTION 'measurement_item_intent_immutable'; END IF;
  ELSIF NEW."definitionIntent" IS NOT NULL THEN
    SELECT "projectId" INTO project_ref FROM rank_check_runs WHERE id=NEW."runId";
    actual:=measurement_definition_source(project_ref,NEW."keywordId");
    IF actual IS NULL OR jsonb_typeof(NEW."definitionIntent") IS DISTINCT FROM 'object' OR NEW."definitionIntent"-ARRAY['version','depth','source'] IS DISTINCT FROM '{}'::jsonb OR NEW."definitionIntent"->>'version' IS DISTINCT FROM '1' OR NEW."definitionIntent"->'source' IS DISTINCT FROM actual
      OR NEW."definitionIntent"->>'depth' NOT IN ('10','20','50','100') OR NEW."definitionIntent"->>'depth' IS NULL
    THEN RAISE EXCEPTION 'measurement_item_intent_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_item_intent_guard BEFORE INSERT OR UPDATE ON rank_check_run_items FOR EACH ROW EXECUTE FUNCTION measurement_item_intent_guard();
CREATE FUNCTION measurement_worker_principal(check_ref text) RETURNS jsonb LANGUAGE sql STABLE SET search_path FROM CURRENT AS $$
  SELECT jsonb_build_object('actorId',r."definitionExecutionOrigin"->'actorId','runId',r.id,'runItemId',i.id,
    'source',r."definitionExecutionOrigin"->'source','trigger',r."definitionExecutionOrigin"->'trigger',
    'credentialKind',r."definitionExecutionOrigin"->'credentialKind','credentialId',r."definitionExecutionOrigin"->'credentialId',
    'selectionKind',r."selectionKind",'selectionHash',r."selectionHash",'checkScheduleId',r."checkScheduleId")
  FROM rank_checks c JOIN keywords k ON k.id=c."keywordId" JOIN rank_check_run_items i ON i."rankCheckId"=c.id AND i."keywordId"=c."keywordId" AND i."runId"=c."runId"
  JOIN rank_check_runs r ON r.id=i."runId" AND r."projectId"=k."projectId"
  WHERE c.id=check_ref AND r."definitionExecutionOrigin" IS NOT NULL AND r."definitionExecutionOrigin"=measurement_run_origin(r) AND i."definitionIntent" IS NOT NULL;
$$;
ALTER TABLE rank_checks ADD COLUMN "definitionExecutionToken" text,
  ADD COLUMN "definitionWorkflowId" text,
  ADD COLUMN "definitionExecutionPrincipal" jsonb,
  ADD CONSTRAINT measurement_worker_claim_pair CHECK (("definitionExecutionToken" IS NULL)=("definitionWorkflowId" IS NULL) AND ("definitionExecutionToken" IS NULL)=("definitionExecutionPrincipal" IS NULL)),
  ADD CONSTRAINT measurement_worker_claim_shape CHECK ("definitionExecutionToken" IS NULL OR
    ("definitionExecutionToken" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' AND length("definitionWorkflowId") BETWEEN 1 AND 256));
ALTER TABLE queued_rank_check_batches ADD COLUMN "definitionWorkflowId" text,
  ADD COLUMN "definitionWorkflowRunId" text,
  ADD CONSTRAINT measurement_queue_workflow_pair CHECK (("definitionWorkflowId" IS NULL)=("definitionWorkflowRunId" IS NULL));
CREATE FUNCTION measurement_worker_claim_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF OLD."definitionExecutionToken" IS NOT NULL THEN
    IF NEW."definitionExecutionToken" IS DISTINCT FROM OLD."definitionExecutionToken" OR NEW."definitionWorkflowId" IS DISTINCT FROM OLD."definitionWorkflowId"
      OR NEW."definitionExecutionPrincipal" IS DISTINCT FROM OLD."definitionExecutionPrincipal" OR NEW."workflowRunId" IS DISTINCT FROM OLD."workflowRunId" THEN RAISE EXCEPTION 'measurement_worker_claim_immutable'; END IF;
  ELSIF NEW."definitionExecutionToken" IS NOT NULL THEN
    IF measurement_worker_principal(NEW.id) IS NULL OR NEW."definitionExecutionPrincipal" IS DISTINCT FROM measurement_worker_principal(NEW.id) OR NEW.status<>'running' OR NEW."workflowRunId" IS NULL OR NEW."runId" IS NULL OR NOT EXISTS(
      SELECT 1 FROM rank_check_run_items i WHERE i."rankCheckId"=NEW.id AND i."keywordId"=NEW."keywordId" AND i."runId"=NEW."runId" AND i.status='running'
    ) THEN RAISE EXCEPTION 'measurement_worker_claim_not_owned'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_worker_claim_immutable BEFORE UPDATE ON rank_checks FOR EACH ROW EXECUTE FUNCTION measurement_worker_claim_immutable();
CREATE FUNCTION measurement_queue_workflow_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF OLD."definitionWorkflowId" IS NOT NULL AND (NEW.priority IS DISTINCT FROM OLD.priority OR NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW.source IS DISTINCT FROM OLD.source OR NEW.trigger IS DISTINCT FROM OLD.trigger
    OR NEW."credentialId" IS DISTINCT FROM OLD."credentialId" OR NEW."credentialKind" IS DISTINCT FROM OLD."credentialKind") THEN RAISE EXCEPTION 'measurement_queue_original_identity_immutable'; END IF;
  IF OLD."definitionWorkflowId" IS NOT NULL AND (NEW."definitionWorkflowId" IS DISTINCT FROM OLD."definitionWorkflowId" OR NEW."definitionWorkflowRunId" IS DISTINCT FROM OLD."definitionWorkflowRunId") THEN RAISE EXCEPTION 'measurement_queue_workflow_immutable'; END IF;
  IF OLD."definitionWorkflowId" IS NULL AND NEW."definitionWorkflowId" IS NOT NULL AND (NEW.state<>'prepared' OR length(NEW."definitionWorkflowId") NOT BETWEEN 1 AND 256 OR length(NEW."definitionWorkflowRunId") NOT BETWEEN 1 AND 256) THEN RAISE EXCEPTION 'measurement_queue_workflow_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_queue_workflow_immutable BEFORE UPDATE ON queued_rank_check_batches FOR EACH ROW EXECUTE FUNCTION measurement_queue_workflow_immutable();
-- Actual credential-free submitted child body, separate from logical semantic binding and native ledger.
CREATE TABLE measurement_native_request_proofs (
  "bindingId" text NOT NULL REFERENCES measurement_execution_bindings(id) ON DELETE CASCADE,
  "operationId" text NOT NULL, proof jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY("bindingId","operationId")
);
CREATE TABLE measurement_native_dispatch_proofs (
  namespace text NOT NULL, principal text NOT NULL, "operationId" text NOT NULL, "leaseId" text NOT NULL, "bindingId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(namespace,"operationId"),
  CONSTRAINT measurement_native_prepared_fk FOREIGN KEY("bindingId","operationId") REFERENCES measurement_native_request_proofs("bindingId","operationId") ON DELETE CASCADE,
  CONSTRAINT measurement_native_operation_fk FOREIGN KEY(namespace,"operationId") REFERENCES metering_operation(namespace,operation_id) ON DELETE NO ACTION
);
CREATE FUNCTION measurement_native_request_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b measurement_execution_bindings;
BEGIN
  SELECT * INTO b FROM measurement_execution_bindings WHERE id=NEW."bindingId";
  IF b.id IS NULL OR jsonb_typeof(NEW.proof) IS DISTINCT FROM 'object' OR NEW.proof-ARRAY['version','route','requestedDepth','pageStart','pageSize','nativeDepth','priority','fingerprint'] IS DISTINCT FROM '{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(NEW.proof))<>8 OR length(NEW."operationId") NOT BETWEEN 1 AND 256 OR NEW.proof->>'version' IS DISTINCT FROM '1'
    OR NEW.proof->>'requestedDepth' IS DISTINCT FROM b.request->>'depth' OR NEW.proof->>'fingerprint' IS NULL OR NEW.proof->>'fingerprint' !~ '^[0-9a-f]{64}$'
    OR NEW.proof->>'route' IS NULL OR NEW.proof->>'route' NOT IN ('live','queued') THEN RAISE EXCEPTION 'measurement_native_request_invalid'; END IF;
  IF b.request->>'providerId'='serpapi' THEN
    IF NEW.proof->>'route' IS DISTINCT FROM 'live' OR NEW.proof->>'pageSize' IS DISTINCT FROM '10' OR NEW.proof->>'pageStart' IS NULL
      OR NEW.proof->>'pageStart' !~ '^[0-9]+$' OR (NEW.proof->>'pageStart')::numeric>=(b.request->>'depth')::numeric
      OR mod((NEW.proof->>'pageStart')::numeric,10)<>0 OR NEW.proof->>'nativeDepth' IS NOT NULL OR NEW.proof->>'priority' IS NOT NULL
    THEN RAISE EXCEPTION 'measurement_native_request_page'; END IF;
  ELSIF b.request->>'providerId'='dataforseo' THEN
    IF NEW.proof->>'nativeDepth' IS DISTINCT FROM b.request->>'depth' OR NEW.proof->>'pageStart' IS NOT NULL OR NEW.proof->>'pageSize' IS NOT NULL
      OR (NEW.proof->>'route'='queued' AND (NEW.proof->>'priority' IS NULL OR NEW.proof->>'priority' NOT IN ('1','2')))
      OR (NEW.proof->>'route'='live' AND NEW.proof->>'priority' IS NOT NULL) THEN RAISE EXCEPTION 'measurement_native_request_depth'; END IF;
  ELSE RAISE EXCEPTION 'measurement_native_request_provider'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_native_request_insert BEFORE INSERT ON measurement_native_request_proofs FOR EACH ROW EXECUTE FUNCTION measurement_native_request_insert();
CREATE FUNCTION measurement_native_dispatch_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b measurement_execution_bindings; c rank_checks; i rank_check_run_items; contextrow metering_paid_attempt_context; op metering_operation; caller jsonb;
BEGIN
  SELECT * INTO b FROM measurement_execution_bindings WHERE id=NEW."bindingId";
  SELECT * INTO c FROM rank_checks WHERE id=b."rankCheckId";
  SELECT * INTO i FROM rank_check_run_items WHERE "rankCheckId"=c.id AND "runId"=c."runId" AND "keywordId"=b."keywordId";
  SELECT * INTO contextrow FROM metering_paid_attempt_context WHERE namespace=NEW.namespace AND operation_id=NEW."operationId";
  SELECT * INTO op FROM metering_operation WHERE namespace=NEW.namespace AND operation_id=NEW."operationId";
  caller:=measurement_worker_principal(c.id);
  IF b.id IS NULL OR c.id IS NULL OR i.id IS NULL OR caller IS NULL OR c."definitionExecutionToken" IS NULL OR c."definitionExecutionPrincipal" IS DISTINCT FROM caller
    OR i."definitionIntent"->'source' IS DISTINCT FROM b.source OR i."definitionIntent"->>'depth' IS DISTINCT FROM b.request->>'depth'
    OR contextrow.operation_id IS NULL OR op.operation_id IS NULL OR contextrow.principal IS DISTINCT FROM NEW.principal OR op.principal IS DISTINCT FROM NEW.principal
    OR op.state IS DISTINCT FROM 'dispatch_intended' OR op.lease_id IS DISTINCT FROM NEW."leaseId" OR op.lease_expires_at IS NULL OR op.lease_expires_at<=clock_timestamp()
    OR contextrow.dispatch_lease_id IS DISTINCT FROM NEW."leaseId" OR contextrow.fenced_at IS NOT NULL
    OR contextrow.context->>'projectId' IS DISTINCT FROM b."projectId" OR contextrow.context->>'keywordId' IS DISTINCT FROM b."keywordId"
    OR contextrow.context->>'rankCheckId' IS DISTINCT FROM c.id OR contextrow.context->>'rankCheckRunId' IS DISTINCT FROM c."runId" OR contextrow.context->>'rankCheckRunItemId' IS DISTINCT FROM i.id
    OR contextrow.context->>'correlationId' IS DISTINCT FROM coalesce(b."queuedTaskId",c.id) OR op.input->>'provider' IS DISTINCT FROM b.request->>'providerId'
    OR op.input->'scope'->'accessCredential'->>'kind' IS DISTINCT FROM caller->>'credentialKind' OR op.input->'scope'->'accessCredential'->>'id' IS DISTINCT FROM caller->>'credentialId'
  THEN RAISE EXCEPTION 'measurement_native_dispatch_mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_native_dispatch_insert BEFORE INSERT ON measurement_native_dispatch_proofs FOR EACH ROW EXECUTE FUNCTION measurement_native_dispatch_insert();
CREATE FUNCTION measurement_native_proof_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM measurement_execution_bindings WHERE id=OLD."bindingId") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'measurement_native_proof_append_only';
END $$;
CREATE TRIGGER measurement_native_request_immutable BEFORE UPDATE OR DELETE ON measurement_native_request_proofs FOR EACH ROW EXECUTE FUNCTION measurement_native_proof_immutable();
CREATE TRIGGER measurement_native_dispatch_immutable BEFORE UPDATE OR DELETE ON measurement_native_dispatch_proofs FOR EACH ROW EXECUTE FUNCTION measurement_native_proof_immutable();

CREATE TABLE measurement_snapshot_request_bindings (
  id text PRIMARY KEY, "projectId" text NOT NULL, "keywordId" text NOT NULL, "rankCheckId" text NOT NULL,
  "connectionId" text NOT NULL, "originalBindingId" text, binding jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("projectId",id),
  CONSTRAINT measurement_snapshot_keyword_fk FOREIGN KEY("projectId","keywordId") REFERENCES keywords("projectId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_snapshot_check_fk FOREIGN KEY("keywordId","rankCheckId") REFERENCES rank_checks("keywordId",id) ON DELETE CASCADE,
  CONSTRAINT measurement_snapshot_original_fk FOREIGN KEY("projectId","originalBindingId") REFERENCES measurement_execution_bindings("projectId",id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
-- Connection ID is an immutable retained reference, not a mutable FK or a live credential.
CREATE TABLE measurement_snapshot_request_attempts (
  "requestId" text NOT NULL REFERENCES measurement_snapshot_request_bindings(id) ON DELETE CASCADE,
  "operationId" text NOT NULL, "requestFingerprint" text NOT NULL CHECK("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY("requestId","operationId")
);
CREATE TABLE measurement_snapshot_dispatch_proofs (
  "requestId" text NOT NULL, namespace text NOT NULL, principal text NOT NULL, "operationId" text NOT NULL, "leaseId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(namespace,"operationId"),
  CONSTRAINT measurement_snapshot_prepared_fk FOREIGN KEY("requestId","operationId") REFERENCES measurement_snapshot_request_attempts("requestId","operationId") ON DELETE CASCADE,
  CONSTRAINT measurement_snapshot_native_fk FOREIGN KEY(namespace,"operationId") REFERENCES metering_operation(namespace,operation_id) ON DELETE NO ACTION
);
CREATE FUNCTION measurement_snapshot_binding_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE checkrow rank_checks; raw jsonb; original measurement_execution_bindings; actor_ref text;
BEGIN
  SELECT c.* INTO checkrow FROM rank_checks c JOIN keywords k ON k.id=c."keywordId"
    WHERE c.id=NEW."rankCheckId" AND c."keywordId"=NEW."keywordId" AND k."projectId"=NEW."projectId" AND c.status='completed' AND c.provider='serpapi';
  raw:=checkrow.raw; actor_ref:=NEW.binding->>'actorId';
  IF checkrow.id IS NULL OR NEW.binding->>'id' IS DISTINCT FROM NEW.id OR NEW.binding->>'projectId' IS DISTINCT FROM NEW."projectId"
    OR NEW.binding->>'keywordId' IS DISTINCT FROM NEW."keywordId" OR NEW.binding->>'rankCheckId' IS DISTINCT FROM NEW."rankCheckId"
    OR NEW.binding->>'connectionId' IS DISTINCT FROM NEW."connectionId" OR NEW.binding->>'originalBindingId' IS DISTINCT FROM NEW."originalBindingId"
    OR NEW.binding->'context' IS DISTINCT FROM raw->'snapshotContinuation' OR raw->'snapshotContinuation'->>'connectionId' IS DISTINCT FROM NEW."connectionId"
    OR raw->'snapshotExtension'->>'state' IS DISTINCT FROM 'running' OR raw->'snapshotExtension'->>'requestId' IS DISTINCT FROM NEW.id
    OR NEW.binding->'nextStart' IS DISTINCT FROM raw->'snapshotExtension'->'nextStart' OR NEW.binding->>'leaseUntil' IS DISTINCT FROM raw->'snapshotExtension'->>'leaseUntil'
    OR NEW.binding->>'requestDepth' IS DISTINCT FROM '10' OR (NEW.binding->>'leaseUntil')::timestamptz<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM users u JOIN memberships m ON m."userId"=u.id WHERE u.id=actor_ref AND u."deactivatedAt" IS NULL AND m."projectId"=NEW."projectId" AND m.role IN ('owner','admin','member'))
  THEN RAISE EXCEPTION 'measurement_snapshot_not_owned'; END IF;
  IF NEW."originalBindingId" IS NOT NULL THEN
    SELECT * INTO original FROM measurement_execution_bindings WHERE id=NEW."originalBindingId" AND "projectId"=NEW."projectId" AND "keywordId"=NEW."keywordId" AND "rankCheckId"=NEW."rankCheckId";
    IF original.id IS NULL OR original.request->>'providerId'<>'serpapi' OR NEW.binding->>'originProof'<>'definition_binding'
      OR NOT EXISTS(SELECT 1 FROM observation_runs o WHERE o."rankCheckId"=NEW."rankCheckId" AND o."projectId"=NEW."projectId" AND o."definitionBindingId"=original.id)
    THEN RAISE EXCEPTION 'measurement_snapshot_original_mismatch'; END IF;
  ELSIF NEW.binding->>'originProof' IS DISTINCT FROM 'legacy_retained_context' THEN RAISE EXCEPTION 'measurement_snapshot_legacy_unknown'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_snapshot_binding_insert BEFORE INSERT ON measurement_snapshot_request_bindings FOR EACH ROW EXECUTE FUNCTION measurement_snapshot_binding_insert();
CREATE FUNCTION measurement_snapshot_native_insert() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE contextrow metering_paid_attempt_context; op metering_operation; bindingrow measurement_snapshot_request_bindings;
BEGIN
  SELECT * INTO bindingrow FROM measurement_snapshot_request_bindings WHERE id=NEW."requestId";
  SELECT * INTO contextrow FROM metering_paid_attempt_context WHERE namespace=NEW.namespace AND operation_id=NEW."operationId";
  SELECT * INTO op FROM metering_operation WHERE namespace=NEW.namespace AND operation_id=NEW."operationId";
  IF bindingrow.id IS NULL OR contextrow.operation_id IS NULL OR contextrow.principal IS DISTINCT FROM NEW.principal OR op.principal IS DISTINCT FROM NEW.principal OR op.operation_id IS NULL
    OR op.state<>'dispatch_intended' OR op.lease_id IS DISTINCT FROM NEW."leaseId" OR op.lease_expires_at IS NULL OR op.lease_expires_at<=clock_timestamp()
    OR contextrow.dispatch_lease_id IS DISTINCT FROM NEW."leaseId" OR contextrow.fenced_at IS NOT NULL
    OR contextrow.context->>'projectId' IS DISTINCT FROM bindingrow."projectId" OR contextrow.context->>'keywordId' IS DISTINCT FROM bindingrow."keywordId"
    OR contextrow.context->>'rankCheckId' IS DISTINCT FROM bindingrow."rankCheckId" OR contextrow.context->>'connectionId' IS DISTINCT FROM bindingrow."connectionId"
    OR contextrow.context->>'correlationId' IS DISTINCT FROM bindingrow."rankCheckId" OR op.input->>'provider' IS DISTINCT FROM 'serpapi' OR op.input->>'fundingSource' IS DISTINCT FROM 'byok'
  THEN RAISE EXCEPTION 'measurement_snapshot_native_mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_snapshot_native_insert BEFORE INSERT ON measurement_snapshot_dispatch_proofs FOR EACH ROW EXECUTE FUNCTION measurement_snapshot_native_insert();
CREATE FUNCTION measurement_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE request_ref text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='measurement_snapshot_request_bindings' THEN
      IF NOT EXISTS(SELECT 1 FROM keywords WHERE id=OLD."keywordId" AND "projectId"=OLD."projectId") OR NOT EXISTS(SELECT 1 FROM rank_checks WHERE id=OLD."rankCheckId") THEN RETURN OLD; END IF;
    ELSE
      request_ref:=to_jsonb(OLD)->>'requestId';
      IF NOT EXISTS(SELECT 1 FROM measurement_snapshot_request_bindings WHERE id=request_ref) THEN RETURN OLD; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'measurement_snapshot_append_only';
END $$;
CREATE TRIGGER measurement_snapshot_binding_immutable BEFORE UPDATE OR DELETE ON measurement_snapshot_request_bindings FOR EACH ROW EXECUTE FUNCTION measurement_snapshot_immutable();
CREATE TRIGGER measurement_snapshot_attempt_immutable BEFORE UPDATE OR DELETE ON measurement_snapshot_request_attempts FOR EACH ROW EXECUTE FUNCTION measurement_snapshot_immutable();
CREATE TRIGGER measurement_snapshot_proof_immutable BEFORE UPDATE OR DELETE ON measurement_snapshot_dispatch_proofs FOR EACH ROW EXECUTE FUNCTION measurement_snapshot_immutable();
