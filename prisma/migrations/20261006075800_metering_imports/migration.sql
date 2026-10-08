-- Immutable content-free invoice journal and serialized revision pointer.
CREATE TABLE metering_import_family (
  family_id TEXT PRIMARY KEY,
  latest_import_id TEXT NOT NULL
);
CREATE TABLE metering_import (
  import_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES metering_import_family(family_id),
  namespace TEXT NOT NULL,
  principal TEXT NOT NULL,
  connection TEXT NOT NULL,
  provider TEXT NOT NULL,
  file_hash TEXT NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  window_from TIMESTAMPTZ NOT NULL,
  window_to TIMESTAMPTZ NOT NULL CHECK (window_to > window_from),
  recorded_at TIMESTAMPTZ NOT NULL,
  identity TEXT NOT NULL,
  body JSONB NOT NULL,
  UNIQUE (family_id, file_hash)
);
ALTER TABLE metering_import_family ADD CONSTRAINT metering_import_latest_fk
  FOREIGN KEY (latest_import_id) REFERENCES metering_import(import_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX metering_import_scope_window_idx
  ON metering_import(namespace,principal,connection,window_from,window_to);
CREATE INDEX metering_operation_connection_created_idx
  ON metering_operation(namespace,principal,(input->'scope'->>'connection'),created_at);
CREATE INDEX metering_receipt_native_id_idx
  ON metering_receipt((body->>'providerRequestId'))
  WHERE body->>'providerRequestId' IS NOT NULL;
CREATE FUNCTION metering_import_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Meter billing imports are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER metering_import_immutable BEFORE UPDATE OR DELETE ON metering_import
  FOR EACH ROW EXECUTE FUNCTION metering_import_immutable();
