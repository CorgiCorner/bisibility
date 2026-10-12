-- Additive preparation only. Legacy drops belong to the final cutover contract.
CREATE TABLE metering_legacy_usage_source (
  source_id text PRIMARY KEY,
  payload jsonb NOT NULL
);
CREATE TABLE metering_legacy_setting_source (
  kind text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(kind, source_id)
);
CREATE TABLE metering_legacy_reference_source (
  kind text NOT NULL,
  reference_id text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(kind, reference_id)
);
CREATE TABLE metering_legacy_proof_source (
  kind text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(kind, source_id)
);
CREATE INDEX metering_legacy_usage_native_idx
  ON metering_legacy_usage_source ((payload->>'connectionId'), (payload->>'providerRequestId'));
CREATE TABLE metering_history_progress (
  migration_id text PRIMARY KEY,
  namespace text,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  cursor text NOT NULL DEFAULT '',
  verified_at timestamptz
);
INSERT INTO metering_history_progress(migration_id) VALUES('20261011021000_accounting_history');
CREATE TABLE metering_history_import (
  migration_id text NOT NULL,
  source_id text NOT NULL,
  source_hash text NOT NULL,
  target_hash text NOT NULL,
  namespace text NOT NULL,
  operation_id text NOT NULL,
  created_operation boolean NOT NULL,
  body jsonb NOT NULL,
  PRIMARY KEY(migration_id, source_id),
  FOREIGN KEY(namespace, operation_id) REFERENCES metering_operation(namespace, operation_id) ON DELETE NO ACTION
);
CREATE TABLE metering_history_reference (
  kind text NOT NULL,
  reference_id text NOT NULL,
  source_id text NOT NULL,
  namespace text NOT NULL,
  operation_id text NOT NULL,
  principal text NOT NULL,
  receipt_id text,
  body jsonb NOT NULL,
  PRIMARY KEY(kind, reference_id),
  FOREIGN KEY(namespace, operation_id) REFERENCES metering_operation(namespace, operation_id) ON DELETE NO ACTION
);

DO $$
BEGIN
  IF to_regclass('provider_cost_entries') IS NOT NULL THEN
    -- An operator must fence producers before taking a nonempty historical snapshot.
    IF EXISTS(SELECT 1 FROM provider_cost_entries)
       AND current_setting('bisibility.accounting_quiesced', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Historical accounting snapshot requires quiesced paid producers';
    END IF;
    LOCK TABLE provider_cost_entries IN ACCESS EXCLUSIVE MODE;
    INSERT INTO metering_legacy_usage_source
      SELECT id, jsonb_build_object(
        'id',id,'projectId',"projectId",'connectionId',"connectionId",'provider',provider,
        'feature',feature::text,'source',source,'trigger',trigger,'tag',tag,'keywordId',"keywordId",
        'correlationId',"correlationId",'providerRequestId',"providerRequestId",
        'credentialKind',"credentialKind",'credentialId',"credentialId",
        'costCents',"costCents"::text,'unitCostCents',"unitCostCents"::text,
        'priceCents',"priceCents"::text,'usageQuantity',"usageQuantity"::text,
        'measurementStatus',"measurementStatus",'credentialSource',"credentialSource"::text,
        'cached',cached,'failed',failed,'createdAt',"createdAt" AT TIME ZONE 'UTC')
      FROM provider_cost_entries;
  END IF;
  IF to_regclass('projects') IS NOT NULL THEN
    INSERT INTO metering_legacy_setting_source
      SELECT 'project',id,jsonb_build_object('id',id,'budgetCapCents',"budgetCapCents"::text,
        'providerAllocationsInitializedAt',"providerAllocationsInitializedAt") FROM projects;
  END IF;
  IF to_regclass('provider_connections') IS NOT NULL THEN
    INSERT INTO metering_legacy_setting_source
      SELECT 'connection',id,jsonb_build_object('id',id,'projectId',"projectId",'provider',provider,
        'allocationUnit',"allocationUnit"::text,'allocationAmountPerMonth',"allocationAmountPerMonth"::text,
        'programmaticAllocationAmountPerMonth',"programmaticAllocationAmountPerMonth"::text,
        'creditsAllocationAmountPerMonth',"creditsAllocationAmountPerMonth"::text,
        'creditsProgrammaticAllocationAmountPerMonth',"creditsProgrammaticAllocationAmountPerMonth"::text,
        'costPerCheckCents',"costPerCheckCents"::text) FROM provider_connections;
  END IF;
  IF to_regclass('provider_connection_rates') IS NOT NULL THEN
    INSERT INTO metering_legacy_setting_source
      SELECT 'rate',id,jsonb_build_object('id',id,'connectionId',"connectionId",'feature',feature::text,
        'amountCents',"amountCents"::text) FROM provider_connection_rates;
  END IF;
  IF to_regclass('metering_usage_evidence') IS NOT NULL THEN
    INSERT INTO metering_legacy_proof_source
      SELECT 'byok',id,jsonb_build_object('namespace',namespace,'principal',principal,
        'projectId',"projectId",'connectionId',"connectionId",'provider',provider,
        'estimate',estimate,'receipt',receipt,'canonicalId',"canonicalId",'discarded',discarded)
      FROM metering_usage_evidence;
  END IF;
  IF to_regclass('ai_tracking_samples') IS NOT NULL THEN
    INSERT INTO metering_legacy_reference_source
      SELECT 'ai_sample',id,"providerCostEntryId",jsonb_build_object('projectId',"projectId")
      FROM ai_tracking_samples WHERE "providerCostEntryId" IS NOT NULL;
  END IF;
  IF to_regclass('ai_tracking_suggestion_generations') IS NOT NULL THEN
    INSERT INTO metering_legacy_reference_source
      SELECT 'ai_generation',id,"providerCostEntryId",jsonb_build_object('projectId',"projectId")
      FROM ai_tracking_suggestion_generations WHERE "providerCostEntryId" IS NOT NULL;
  END IF;
END $$;

CREATE INDEX metering_legacy_reference_source_id_idx ON metering_legacy_reference_source(source_id);
CREATE INDEX metering_legacy_proof_source_id_idx ON metering_legacy_proof_source(source_id);
CREATE FUNCTION metering_history_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical accounting source is immutable';
END $$;
CREATE TRIGGER metering_history_usage_immutable BEFORE UPDATE OR DELETE ON metering_legacy_usage_source FOR EACH ROW EXECUTE FUNCTION metering_history_source_immutable();
CREATE TRIGGER metering_history_setting_immutable BEFORE UPDATE OR DELETE ON metering_legacy_setting_source FOR EACH ROW EXECUTE FUNCTION metering_history_source_immutable();
CREATE TRIGGER metering_history_reference_immutable BEFORE UPDATE OR DELETE ON metering_legacy_reference_source FOR EACH ROW EXECUTE FUNCTION metering_history_source_immutable();
CREATE TRIGGER metering_history_proof_immutable BEFORE UPDATE OR DELETE ON metering_legacy_proof_source FOR EACH ROW EXECUTE FUNCTION metering_history_source_immutable();
