-- Retain legacy BYOK snapshots; new continuations capture and enforce their funding source.

CREATE OR REPLACE FUNCTION measurement_snapshot_binding_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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
  IF NEW.binding ? 'credentialSource' AND (
    NEW.binding->>'credentialSource' NOT IN ('own','hosted') OR
    NOT EXISTS(SELECT 1 FROM provider_connections c WHERE c.id=NEW."connectionId"
      AND c."projectId"=NEW."projectId" AND c.provider='serpapi' AND c.kind='serp'
      AND c.status='connected' AND c.enabled=true
      AND c."credentialSource"::text=NEW.binding->>'credentialSource'))
  THEN RAISE EXCEPTION 'measurement_snapshot_source_mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION measurement_snapshot_native_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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
    OR contextrow.context->>'correlationId' IS DISTINCT FROM bindingrow."rankCheckId" OR op.input->>'provider' IS DISTINCT FROM 'serpapi' OR op.input->>'fundingSource' IS DISTINCT FROM (CASE WHEN bindingrow.binding->>'credentialSource'='hosted' THEN 'platform' ELSE 'byok' END)
  THEN RAISE EXCEPTION 'measurement_snapshot_native_mismatch'; END IF;
  RETURN NEW;
END $$;
