CREATE TABLE metering_operation (
  operation_pk text PRIMARY KEY,
  namespace text NOT NULL,
  principal text NOT NULL,
  operation_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','dispatch_intended','pending','settled','released')),
  version integer NOT NULL,
  semantic_hash text NOT NULL,
  budget_epochs jsonb NOT NULL,
  reservation_expires_at timestamptz NOT NULL,
  lease_id text,
  lease_holder text,
  lease_expires_at timestamptz,
  lease_kind text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  input jsonb NOT NULL,
  warnings jsonb NOT NULL,
  UNIQUE(namespace,operation_id)
);
CREATE INDEX metering_operation_expiry_idx ON metering_operation(namespace,state,reservation_expires_at);
CREATE TABLE metering_receipt (
  receipt_pk text PRIMARY KEY,
  operation_pk text NOT NULL REFERENCES metering_operation(operation_pk),
  receipt_id text NOT NULL,
  supersedes text,
  body jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  cost_units bigint,
  cost_certainty text NOT NULL,
  sequence integer NOT NULL,
  UNIQUE(operation_pk,receipt_id),
  UNIQUE(operation_pk,sequence)
);
CREATE TABLE metering_measurement (
  receipt_pk text NOT NULL REFERENCES metering_receipt(receipt_pk),
  unit text NOT NULL,
  value numeric(38,0),
  scale integer,
  certainty text NOT NULL,
  PRIMARY KEY(receipt_pk,unit)
);
CREATE TABLE metering_command (
  operation_pk text NOT NULL REFERENCES metering_operation(operation_pk),
  command_id text NOT NULL,
  kind text NOT NULL,
  input_hash text NOT NULL,
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(operation_pk,command_id)
);
CREATE TABLE metering_budget (
  sequence bigserial NOT NULL,
  namespace text NOT NULL,
  budget_id text NOT NULL,
  version integer NOT NULL,
  scope_kind text NOT NULL,
  scope_key text NOT NULL,
  surface text NOT NULL,
  unit text NOT NULL,
  limit_value numeric(38,0),
  limit_scale integer,
  "window" jsonb NOT NULL,
  on_exceed text NOT NULL,
  body jsonb NOT NULL,
  PRIMARY KEY(namespace,budget_id,version)
);
CREATE INDEX metering_budget_scope_idx ON metering_budget(namespace,scope_key,surface);
CREATE TABLE metering_budget_usage (
  namespace text NOT NULL,
  budget_id text NOT NULL,
  epoch text NOT NULL,
  settled_value numeric(38,0) NOT NULL,
  outstanding_value numeric(38,0) NOT NULL,
  scale integer NOT NULL,
  PRIMARY KEY(namespace,budget_id,epoch)
);
CREATE TABLE metering_event (
  event_id bigserial PRIMARY KEY,
  operation_pk text NOT NULL REFERENCES metering_operation(operation_pk),
  namespace text NOT NULL,
  state text NOT NULL,
  receipt_pk text REFERENCES metering_receipt(receipt_pk),
  occurred_at timestamptz
);
CREATE INDEX metering_event_time_idx ON metering_event(namespace,occurred_at,event_id);
CREATE INDEX metering_event_operation_idx ON metering_event(operation_pk,event_id DESC);
CREATE TABLE metering_metadata (key text PRIMARY KEY,value text NOT NULL);

CREATE TABLE metering_shadow (
  namespace text NOT NULL,
  operation_id text NOT NULL,
  project_id text NOT NULL,
  connection_id text NOT NULL,
  legacy text NOT NULL,
  meter text NOT NULL,
  settled text NOT NULL,
  duration_ms double precision NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(namespace,operation_id)
);
CREATE INDEX metering_shadow_project_created ON metering_shadow(namespace,project_id,created_at);

ALTER TABLE "queued_rank_check_tasks" ADD COLUMN "meteringContext" jsonb;
