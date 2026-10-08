ALTER TABLE metering_operation ADD COLUMN alerts jsonb NOT NULL DEFAULT '[]';

CREATE TABLE metering_alert (
  alert_key text PRIMARY KEY,
  namespace text NOT NULL,
  budget_id text NOT NULL,
  epoch text NOT NULL,
  threshold text NOT NULL,
  UNIQUE(namespace, budget_id, epoch, threshold)
);
CREATE INDEX metering_alert_budget_idx ON metering_alert(namespace, budget_id, epoch);

CREATE TABLE metering_request_command (
  namespace text NOT NULL,
  command_id text NOT NULL,
  identity_hash text NOT NULL,
  PRIMARY KEY(namespace, command_id)
);

CREATE TABLE metering_request_count (
  bucket_key text PRIMARY KEY,
  namespace text NOT NULL,
  day date NOT NULL,
  body jsonb NOT NULL,
  count numeric(38,0) NOT NULL CHECK (count > 0)
);
CREATE INDEX metering_request_count_window_idx ON metering_request_count(namespace, day);
