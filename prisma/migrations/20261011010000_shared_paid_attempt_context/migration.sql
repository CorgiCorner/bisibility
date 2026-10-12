CREATE TABLE metering_paid_attempt_context (
  namespace TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  principal TEXT NOT NULL,
  context JSONB NOT NULL,
  dispatch_lease_id TEXT,
  fenced_at TIMESTAMPTZ,
  debit_id TEXT,
  PRIMARY KEY (namespace, operation_id),
  CONSTRAINT metering_paid_attempt_operation_fk FOREIGN KEY (namespace, operation_id)
    REFERENCES metering_operation(namespace, operation_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT metering_paid_attempt_fence_check CHECK (fenced_at IS NULL OR dispatch_lease_id IS NOT NULL)
);
CREATE INDEX metering_paid_attempt_project_idx ON metering_paid_attempt_context(namespace, (context->>'projectId'));
CREATE INDEX metering_paid_attempt_connection_idx ON metering_paid_attempt_context(namespace, (context->>'connectionId'));
