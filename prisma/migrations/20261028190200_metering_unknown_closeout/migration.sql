CREATE TABLE metering_unknown_closeout (
  operation_pk text PRIMARY KEY REFERENCES metering_operation(operation_pk) ON DELETE NO ACTION ON UPDATE NO ACTION,
  namespace text NOT NULL,
  operation_id text NOT NULL,
  version integer NOT NULL CHECK (version>0),
  input jsonb NOT NULL,
  attempt_id text NOT NULL,
  credential_version text NOT NULL,
  policy text NOT NULL CHECK (policy='native-byok-cost-unknown-v1'),
  plan_hash text NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  actor_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE(namespace,operation_id)
);
CREATE FUNCTION protect_metering_unknown_closeout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Unknown-cost dispositions are immutable; retain the original accounting evidence';
END;
$$;
CREATE TRIGGER metering_unknown_closeout_immutable
  BEFORE UPDATE OR DELETE ON metering_unknown_closeout
  FOR EACH ROW EXECUTE FUNCTION protect_metering_unknown_closeout();
