-- Original physical fence values stay untouched. NULL ISO on existing rows means unknown legacy instant.
ALTER TABLE metering_paid_attempt_context ADD COLUMN fenced_at_iso TEXT;
CREATE FUNCTION metering_preserve_transport_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.fenced_at IS NOT NULL THEN
    IF NEW.fenced_at IS DISTINCT FROM OLD.fenced_at
      OR NEW.fenced_at_iso IS DISTINCT FROM OLD.fenced_at_iso
      OR NEW.dispatch_lease_id IS DISTINCT FROM OLD.dispatch_lease_id
      OR NEW.namespace IS DISTINCT FROM OLD.namespace
      OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.principal IS DISTINCT FROM OLD.principal
      OR (NEW.context-'chargeReplayed') IS DISTINCT FROM (OLD.context-'chargeReplayed') THEN
      RAISE EXCEPTION 'Committed transport fence identity and evidence are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.fenced_at IS NULL THEN
    IF NEW.fenced_at_iso IS NOT NULL THEN
      RAISE EXCEPTION 'Unfenced transport cannot carry ISO evidence' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.dispatch_lease_id IS NULL OR NEW.fenced_at_iso IS NULL
    OR NEW.fenced_at_iso !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN
    RAISE EXCEPTION 'New transport fence requires original UTC ISO evidence' USING ERRCODE='23514';
  END IF;
  IF NEW.fenced_at IS DISTINCT FROM NEW.fenced_at_iso::timestamptz THEN
    RAISE EXCEPTION 'Transport fence physical instant differs from original ISO evidence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metering_transport_fence BEFORE INSERT OR UPDATE ON metering_paid_attempt_context
  FOR EACH ROW EXECUTE FUNCTION metering_preserve_transport_fence();

-- Fence legacy non-UTC writers without rewriting any historical timestamp.
CREATE INDEX metering_history_import_operation_idx ON metering_history_import(namespace,operation_id);
CREATE FUNCTION metering_require_utc_writer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('TimeZone') <> 'UTC' THEN
    RAISE EXCEPTION 'Metering writes require a UTC session; drain legacy writers before adoption'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_operation
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_receipt
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_event
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_import
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_paid_attempt_context
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
CREATE TRIGGER metering_utc_writer BEFORE INSERT OR UPDATE ON metering_history_progress
  FOR EACH ROW EXECUTE FUNCTION metering_require_utc_writer();
