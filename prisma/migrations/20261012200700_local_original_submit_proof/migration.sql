-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- PROPOSED SOURCE ONLY. Root migration writer reviews/applies; no SQL was executed.
-- Diagnostic original response evidence. No accounting reduction, amount projection or TTL.
CREATE TABLE "local_original_submit_proofs" (
  "namespace" TEXT NOT NULL, "attemptId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL, "itemId" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL, "proof" JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("namespace", "attemptId"), UNIQUE ("projectId", "itemId"),
  CONSTRAINT "local_submit_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "local_submit_item_fk" FOREIGN KEY ("projectId", "itemId") REFERENCES "local_measurement_run_items"("projectId", "id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "local_submit_native_fk" FOREIGN KEY ("attemptId") REFERENCES "metering_usage_evidence"("id") ON DELETE NO ACTION,
  CONSTRAINT "local_submit_paid_fk" FOREIGN KEY ("namespace", "attemptId") REFERENCES "metering_paid_attempt_context"("namespace", "operation_id") ON DELETE NO ACTION,
  CONSTRAINT "local_submit_body_check" CHECK (
    pg_catalog.jsonb_typeof("proof")='object' AND octet_length("proof"::text)<=262144
    AND "bodyHash" ~ '^[a-f0-9]{64}$'
    AND COALESCE("proof"->>'bodyHash'="bodyHash",FALSE)
    AND COALESCE("proof"->'version'='1'::jsonb,FALSE)
    AND COALESCE("proof"->>'source'='dispatched_original_submit',FALSE)
  )
);

CREATE FUNCTION "guard_local_original_submit_proof"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF pg_catalog.pg_trigger_depth()>=2 AND NOT EXISTS (SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Original local response proof can only follow project deletion' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Original local response proof is immutable' USING ERRCODE='23514'; END IF;
  -- Match the immutable original dispatched item, never current project owner/credentials.
  PERFORM id FROM projects WHERE id=NEW."projectId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original local project is unavailable' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM local_measurement_run_items i
    JOIN local_measurement_targets t ON t.id=i."targetId" AND t."projectId"=i."projectId"
    JOIN metering_usage_evidence e ON e.id=i."preparedAttemptId" AND e.namespace=i.namespace
    JOIN metering_paid_attempt_context c ON c.namespace=e.namespace AND c.operation_id=e.id AND c.principal=e.principal
    WHERE i.id=NEW."itemId" AND i."projectId"=NEW."projectId" AND i.namespace=NEW.namespace
      AND i."preparedAttemptId"=NEW."attemptId" AND e."projectId"=i."projectId" AND e.feature='local_scan' AND NOT e.discarded
      AND e."connectionId"=i."connectionId" AND e.provider=i.provider AND e."correlationId"=i."correlationId"
      AND c.dispatch_lease_id=i."preparedLeaseId" AND c.fenced_at IS NOT NULL
      AND c.context->>'providerCredentialVersion'=i."credentialVersion" AND c.context->>'feature'='local_scan'
      AND c.context->>'projectId'=i."projectId" AND c.context->>'connectionId'=i."connectionId" AND c.context->>'correlationId'=i."correlationId"
      AND i.record->>'attemptId'=e.id AND i.record->>'status' IN ('unknown_acceptance','accepted','rejected')
      AND NEW.proof->'custody'->>'projectId'=i."projectId" AND NEW.proof->'custody'->>'namespace'=i.namespace
      AND NEW.proof->'custody'->>'preparedAttemptId'=e.id AND NEW.proof->'custody'->>'attemptId'=e.id
      AND NEW.proof->'custody'->>'preparedLeaseId'=i."preparedLeaseId" AND NEW.proof->'custody'->>'requestHash'=i."requestHash"
      AND NEW.proof->'custody'->>'principal'=e.principal AND NEW.proof->'custody'->>'connectionId'=i."connectionId"
      AND NEW.proof->'custody'->>'provider'=i.provider AND NEW.proof->'custody'->>'credentialVersion'=i."credentialVersion"
      AND NEW.proof->'custody'->>'correlationId'=i."correlationId" AND NEW.proof->'custody'->>'operationKey'=i."operationKey"
      AND NEW.proof->'custody'->>'targetKey'=i.record->>'targetKey' AND NEW.proof->'custody'->>'adapterVersion'=i.record->>'adapterVersion'
      AND NEW.proof->'custody'->>'device'=t.target->>'device' AND t."targetKey"=i.record->>'targetKey'
      AND NEW."receivedAt"=(NEW.proof->'outcome'->>'receivedAt')::timestamptz
  ) THEN RAISE EXCEPTION 'Original local response custody is unavailable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "local_submit_original_custody" BEFORE INSERT OR UPDATE OR DELETE ON "local_original_submit_proofs"
  FOR EACH ROW EXECUTE FUNCTION "guard_local_original_submit_proof"();

-- String-array canonicalization matches Usagekit reference key() WITHOUT jsonb text spaces.
-- Required later PG parity fixtures: quote, slash, backslash, control chars, Unicode, equal locks.
CREATE FUNCTION "local_submit_pair_key"(left_value TEXT,right_value TEXT) RETURNS TEXT
  LANGUAGE SQL IMMUTABLE STRICT SET search_path FROM CURRENT AS $$ SELECT '['||pg_catalog.to_json(left_value)::text||','||pg_catalog.to_json(right_value)::text||']' $$;

-- Equality only, reflecting canonical proofFacts no-op. No merge or acceptance/finance inference.
CREATE FUNCTION "local_submit_outcome_facts_equal"(left_value JSONB,right_value JSONB) RETURNS BOOLEAN
  LANGUAGE SQL IMMUTABLE STRICT SET search_path FROM CURRENT AS $$ SELECT CASE
    WHEN pg_catalog.jsonb_typeof(left_value)='object' AND pg_catalog.jsonb_typeof(right_value)='object'
      AND pg_catalog.jsonb_typeof(left_value->'taskIds')='array' AND pg_catalog.jsonb_typeof(right_value->'taskIds')='array'
    THEN COALESCE((left_value-ARRAY['receivedAt','taskIds'])=(right_value-ARRAY['receivedAt','taskIds'])
      AND pg_catalog.jsonb_array_length(left_value->'taskIds')=pg_catalog.jsonb_array_length(right_value->'taskIds')
      AND (left_value->'taskIds') @> (right_value->'taskIds') AND (right_value->'taskIds') @> (left_value->'taskIds'),FALSE)
    ELSE FALSE END $$;

CREATE FUNCTION "guard_project_local_execution_deletion"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE e RECORD; i RECORD; o RECORD; c RECORD; p RECORD; item_count INTEGER; native_no_send BOOLEAN;
BEGIN
  -- The actual project DELETE owns this row lock. App admission/capture/finalization use the same row.
  -- Inspect attempts even when their submit response was completely lost (no proof row).
  FOR e IN SELECT * FROM metering_usage_evidence WHERE "projectId"=OLD.id AND feature='local_scan' ORDER BY namespace,"connectionId",id LOOP
    IF e.namespace IS NULL THEN RAISE EXCEPTION 'Local canonical finance is unavailable' USING ERRCODE='23514'; END IF;
    SELECT * INTO o FROM metering_operation WHERE namespace=e.namespace AND operation_id=e.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Local canonical finance is unavailable' USING ERRCODE='23514'; END IF;
    IF o.input->'scope'->>'connection' IS DISTINCT FROM e."connectionId" THEN RAISE EXCEPTION 'Local canonical custody conflicts' USING ERRCODE='23514'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('metering:connection-accounting:'||local_submit_pair_key(e.namespace,e."connectionId"),0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('metering:operation:'||local_submit_pair_key(e.namespace,e.id),0));
    -- Re-read after acquiring the SAME canonical accounting/operation protocol.
    SELECT * INTO o FROM metering_operation WHERE namespace=e.namespace AND operation_id=e.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Local canonical finance is unavailable' USING ERRCODE='23514'; END IF;
    SELECT * INTO c FROM metering_paid_attempt_context WHERE namespace=e.namespace AND operation_id=e.id FOR UPDATE;
    IF NOT FOUND OR c.principal IS DISTINCT FROM e.principal OR o.principal IS DISTINCT FROM e.principal
      OR c.context->>'projectId' IS DISTINCT FROM OLD.id OR c.context->>'connectionId' IS DISTINCT FROM e."connectionId"
      OR c.context->>'feature' IS DISTINCT FROM 'local_scan' OR c.context->>'correlationId' IS DISTINCT FROM e."correlationId"
      OR o.input->'scope'->>'group' IS DISTINCT FROM OLD.id
      OR o.input->'scope'->>'connection' IS DISTINCT FROM e."connectionId"
    THEN RAISE EXCEPTION 'Local canonical custody conflicts' USING ERRCODE='23514'; END IF;
    SELECT count(*) INTO item_count FROM local_measurement_run_items WHERE "projectId"=OLD.id AND namespace=e.namespace AND "preparedAttemptId"=e.id;
    SELECT * INTO p FROM local_original_submit_proofs WHERE namespace=e.namespace AND "attemptId"=e.id;
    -- Recognize the maintained paid:no-send command and its sole exact native receipt, not zero by inference.
    native_no_send=o.state='settled' AND o.lease_id IS NULL AND c.fenced_at IS NULL AND EXISTS (
      SELECT 1 FROM metering_command cmd JOIN metering_receipt r USING(operation_pk)
      WHERE cmd.operation_pk=o.operation_pk AND cmd.command_id='paid:no-send' AND cmd.kind='settle'
        AND cmd.result->>'outcome'='settled' AND cmd.input->>'namespace'=e.namespace
        AND cmd.input->>'operationId'=e.id AND cmd.input->>'principal'=e.principal
        AND cmd.input->'receipt'->>'id'='no-send:'||e.id
        AND r.receipt_id='no-send:'||e.id AND r.body->>'evidenceRef'='no-send:'||e.id
        AND r.supersedes IS NULL AND r.cost_certainty='measured' AND r.cost_units=0
        AND r.body->>'providerRequestId' IS NULL AND COALESCE(r.body->>'source','dispatch')='dispatch'
        AND r.body->'cached'='false'::jsonb AND r.body->'failed'='true'::jsonb
        AND (SELECT count(*) FROM metering_receipt all_receipts WHERE all_receipts.operation_pk=o.operation_pk)=1
        AND EXISTS (SELECT 1 FROM metering_measurement m WHERE m.receipt_pk=r.receipt_pk)
        AND NOT EXISTS (SELECT 1 FROM metering_measurement m WHERE m.receipt_pk=r.receipt_pk
          AND (m.certainty IS DISTINCT FROM 'measured' OR
            (m.unit='paid_attempts' AND (m.value IS DISTINCT FROM 1 OR m.scale IS DISTINCT FROM 0))
            OR (m.unit<>'paid_attempts' AND m.value IS DISTINCT FROM 0)))
    );
    IF e.discarded THEN
      IF (o.state IS DISTINCT FROM 'released' AND NOT native_no_send) OR c.fenced_at IS NOT NULL OR p."attemptId" IS NOT NULL THEN
        RAISE EXCEPTION 'Discarded local finance is unresolved' USING ERRCODE='23514'; END IF;
      IF item_count=0 THEN CONTINUE; END IF;
    END IF;
    IF item_count<>1 THEN RAISE EXCEPTION 'Original local execution proof is unavailable' USING ERRCODE='23514'; END IF;
    SELECT * INTO i FROM local_measurement_run_items WHERE "projectId"=OLD.id AND namespace=e.namespace AND "preparedAttemptId"=e.id FOR UPDATE;
    IF i."connectionId" IS DISTINCT FROM e."connectionId" OR i.provider IS DISTINCT FROM e.provider
      OR i."correlationId" IS DISTINCT FROM e."correlationId" OR i."preparedLeaseId" IS DISTINCT FROM c.dispatch_lease_id
      OR i."credentialVersion" IS DISTINCT FROM c.context->>'providerCredentialVersion'
      OR i.record->>'key' IS DISTINCT FROM i."operationKey" OR i.record->'scope'->>'projectId' IS DISTINCT FROM OLD.id
    THEN RAISE EXCEPTION 'Original local execution custody conflicts' USING ERRCODE='23514'; END IF;
    -- Proven cancellation before any possible send. Expired reservation alone is insufficient.
    IF (o.state='released' OR native_no_send) AND c.fenced_at IS NULL AND p."attemptId" IS NULL AND i.record->>'status'='cancelled'
      AND i.record->'outcome'='null'::jsonb
      AND (i.record->'attemptId'='null'::jsonb OR i.record->>'attemptId'=e.id)
      AND i.record->'cancellationRequested'='true'::jsonb THEN CONTINUE; END IF;
    IF c.fenced_at IS NULL OR o.state IS DISTINCT FROM 'settled'
      OR i.record->'settlementRecorded' IS DISTINCT FROM 'true'::jsonb
      OR i.record->>'attemptId' IS DISTINCT FROM e.id
      OR i.record->>'pendingReconciliationReason' IS NOT NULL
      OR COALESCE(i.record->>'status','') NOT IN ('accepted','rejected')
      OR i.record->'outcome'->>'acceptance' IS DISTINCT FROM i.record->>'status'
    THEN RAISE EXCEPTION 'Local original acceptance or canonical finance is unresolved' USING ERRCODE='23514'; END IF;
    IF (CASE WHEN pg_catalog.jsonb_typeof(i.record->'outcome'->'taskIds')='array' THEN
      (i.record->>'status'='accepted' AND pg_catalog.jsonb_array_length(i.record->'outcome'->'taskIds')=0)
      OR (i.record->>'status'='rejected' AND pg_catalog.jsonb_array_length(i.record->'outcome'->'taskIds')<>0)
      ELSE TRUE END) THEN RAISE EXCEPTION 'Local accepted task evidence is unavailable' USING ERRCODE='23514'; END IF;
    IF i.record->>'status'='accepted' AND NOT EXISTS (
      SELECT 1 FROM observation_runs r WHERE r.id=i.record->>'collectedEvidenceId'
      AND r."projectId"=OLD.id AND r."neutralExecutionItemId"=i.id
    ) THEN RAISE EXCEPTION 'Local accepted tasks have not been collected' USING ERRCODE='23514'; END IF;
    -- Recognize canonical retained evidence; do not implement a second proof reducer in SQL.
    IF p."attemptId" IS NOT NULL AND NOT COALESCE((
      local_submit_outcome_facts_equal(p.proof->'outcome',i.record->'originalOutcome')
      OR local_submit_outcome_facts_equal(p.proof->'outcome',i.record->'outcome')
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(i.record->'reconciliationHistory')='array'
        THEN i.record->'reconciliationHistory' ELSE '[]'::jsonb END) h
        WHERE h->'version'='1'::jsonb AND h->>'kind'='provider_receipt' AND h->>'attemptId'=e.id
          AND h->>'projectId'=OLD.id AND h->>'operationKey'=i."operationKey" AND h->>'targetKey'=i.record->>'targetKey'
          AND h->>'provider'=i.provider AND h->>'adapterVersion'=i.record->>'adapterVersion' AND h->>'device'=p.proof->'custody'->>'device'
          AND ((h->>'proofId'='original-local:'||p."bodyHash" AND h->'outcome'=p.proof->'outcome')
            OR (h->'exhaustive'=p.proof->'exhaustive' AND local_submit_outcome_facts_equal(h->'outcome',p.proof->'outcome'))))
    ),FALSE) THEN RAISE EXCEPTION 'Original local response proof is not reconciled' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM local_measurement_run_items orphan_item WHERE orphan_item."projectId"=OLD.id AND NOT EXISTS (
    SELECT 1 FROM metering_usage_evidence original_evidence WHERE original_evidence.id=orphan_item."preparedAttemptId" AND original_evidence.namespace=orphan_item.namespace
      AND original_evidence."projectId"=OLD.id AND original_evidence.feature='local_scan'
  )) THEN RAISE EXCEPTION 'Original local execution proof is unavailable' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "projects_local_execution_deletion_guard" BEFORE DELETE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION "guard_project_local_execution_deletion"();

-- Preserve original execution when a direct Run/Target/Point removal would otherwise cascade it.
-- Keyword deletion uses the separate operational SET NULL tombstone proposal, not this cascade.
CREATE FUNCTION "guard_retained_local_item_deletion"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth()>=2 AND NOT EXISTS (SELECT 1 FROM projects WHERE id=OLD."projectId") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Retained local execution can only follow safe project deletion' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "local_items_retained_deletion_guard" BEFORE DELETE ON "local_measurement_run_items"
  FOR EACH ROW EXECUTE FUNCTION "guard_retained_local_item_deletion"();
