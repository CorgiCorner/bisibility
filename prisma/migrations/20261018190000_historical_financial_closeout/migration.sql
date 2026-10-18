-- App-owned disposition; the existing Meter remains the only accounting kernel.
CREATE TABLE metering_history_closeout (
  operation_pk TEXT PRIMARY KEY REFERENCES metering_operation(operation_pk),
  namespace TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  migration_id TEXT NOT NULL CHECK(migration_id='20261011021000_accounting_history'),
  source_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  original_receipt_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version=2),
  policy TEXT NOT NULL CHECK(policy='known-cost-incomplete-byok-v1'),
  disposition TEXT NOT NULL CHECK(disposition='financially_closed_identity_incomplete'),
  body JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  UNIQUE(namespace,operation_id),
  UNIQUE(migration_id,source_id),
  FOREIGN KEY(migration_id,source_id) REFERENCES metering_history_import(migration_id,source_id)
);
CREATE FUNCTION metering_validate_history_closeout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM metering_operation o
    JOIN metering_history_import h ON h.namespace=o.namespace AND h.operation_id=o.operation_id
    JOIN metering_receipt r ON r.operation_pk=o.operation_pk AND r.receipt_id=NEW.receipt_id
    WHERE o.operation_pk=NEW.operation_pk AND o.namespace=NEW.namespace AND o.operation_id=NEW.operation_id
      AND o.version=NEW.version AND o.state='settled' AND o.lease_id IS NULL
      AND o.input->>'provider'='historical-unknown' AND o.input->>'fundingSource'='byok'
      AND h.migration_id=NEW.migration_id AND h.source_id=NEW.source_id AND h.created_operation
      AND h.source_hash=NEW.source_hash AND h.target_hash=NEW.target_hash
      AND r.supersedes=NEW.original_receipt_id AND r.cost_certainty='measured' AND r.cost_units IS NOT NULL
      AND r.body->>'source'='import' AND r.body->'metadata'->'historicalCloseout'->>'policy'=NEW.policy
      AND r.body->'metadata'->'historicalCloseout'->>'disposition'=NEW.disposition
      AND r.recorded_at=NEW.recorded_at
      AND NOT EXISTS(SELECT 1 FROM metering_receipt later WHERE later.operation_pk=o.operation_pk AND later.sequence>r.sequence)) THEN
    RAISE EXCEPTION 'Closeout must bind the exact financially settled original correction';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metering_closeout_binding BEFORE INSERT ON metering_history_closeout FOR EACH ROW EXECUTE FUNCTION metering_validate_history_closeout();
CREATE TRIGGER metering_closeout_immutable BEFORE UPDATE OR DELETE ON metering_history_closeout FOR EACH ROW EXECUTE FUNCTION metering_history_source_immutable();

CREATE FUNCTION metering_seal_history_closeout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_pk TEXT; new_pk TEXT;
BEGIN
  IF TG_TABLE_NAME='metering_measurement' THEN
    IF TG_OP<>'INSERT' THEN SELECT operation_pk INTO old_pk FROM metering_receipt WHERE receipt_pk=OLD.receipt_pk; END IF;
    IF TG_OP<>'DELETE' THEN SELECT operation_pk INTO new_pk FROM metering_receipt WHERE receipt_pk=NEW.receipt_pk; END IF;
  ELSIF TG_TABLE_NAME IN ('metering_paid_attempt_context','metering_history_import') THEN
    IF TG_OP<>'INSERT' THEN SELECT operation_pk INTO old_pk FROM metering_operation WHERE namespace=OLD.namespace AND operation_id=OLD.operation_id; END IF;
    IF TG_OP<>'DELETE' THEN SELECT operation_pk INTO new_pk FROM metering_operation WHERE namespace=NEW.namespace AND operation_id=NEW.operation_id; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN old_pk := OLD.operation_pk; END IF;
    IF TG_OP<>'DELETE' THEN new_pk := NEW.operation_pk; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM metering_history_closeout WHERE operation_pk=old_pk OR operation_pk=new_pk) THEN
    RAISE EXCEPTION 'Historical financial closeout is sealed; attributable reopening requires an explicit reviewed policy';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metering_closeout_seal BEFORE UPDATE OR DELETE ON metering_operation FOR EACH ROW EXECUTE FUNCTION metering_seal_history_closeout();
CREATE TRIGGER metering_closeout_seal BEFORE INSERT OR UPDATE OR DELETE ON metering_receipt FOR EACH ROW EXECUTE FUNCTION metering_seal_history_closeout();
CREATE TRIGGER metering_closeout_seal BEFORE INSERT OR UPDATE OR DELETE ON metering_measurement FOR EACH ROW EXECUTE FUNCTION metering_seal_history_closeout();
CREATE TRIGGER metering_closeout_seal BEFORE INSERT OR UPDATE OR DELETE ON metering_paid_attempt_context FOR EACH ROW EXECUTE FUNCTION metering_seal_history_closeout();
CREATE TRIGGER metering_closeout_seal BEFORE UPDATE OR DELETE ON metering_history_import FOR EACH ROW EXECUTE FUNCTION metering_seal_history_closeout();
