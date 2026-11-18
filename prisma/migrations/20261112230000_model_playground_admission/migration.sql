CREATE TABLE model_playground_payment_quotes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  principal TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  rejection TEXT,
  confirmation_key TEXT,
  replay_of TEXT REFERENCES model_playground_payment_quotes(id),
  CHECK (NOT (accepted_at IS NOT NULL AND rejection IS NOT NULL)),
  CHECK (confirmation_key IS NULL OR accepted_at IS NOT NULL)
);
CREATE INDEX model_playground_payment_quotes_content_idx
  ON model_playground_payment_quotes(project_id, actor_id, content_hash, created_at);
CREATE UNIQUE INDEX model_playground_payment_confirmation_idx
  ON model_playground_payment_quotes(project_id, actor_id, confirmation_key)
  WHERE confirmation_key IS NOT NULL;
-- The unique row is written before choosing a root, so snapshot isolation must
-- serialize or abort a contender before it can reserve a second live taskset.
CREATE TABLE model_playground_payment_content (
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  root_quote_id TEXT NOT NULL REFERENCES model_playground_payment_quotes(id),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (project_id, actor_id, content_hash)
);
CREATE TABLE model_playground_payment_attempts (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES model_playground_payment_quotes(id),
  column_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  principal TEXT NOT NULL,
  binding JSONB NOT NULL,
  dispatched_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  root_quote_id TEXT REFERENCES model_playground_payment_quotes(id),
  root_column_id TEXT,
  superseded_at TIMESTAMPTZ,
  refusal_reason TEXT,
  CHECK (refusal_reason IS NULL OR dispatched_at IS NULL),
  CHECK (observed_at IS NULL OR dispatched_at IS NOT NULL),
  CHECK (acknowledged_at IS NULL OR dispatched_at IS NOT NULL),
  CHECK (superseded_at IS NULL OR refusal_reason IS NOT NULL),
  CHECK ((root_quote_id IS NULL) = (root_column_id IS NULL)),
  UNIQUE (quote_id, column_id),
  FOREIGN KEY (namespace, id) REFERENCES metering_operation(namespace, operation_id)
);
CREATE UNIQUE INDEX model_playground_payment_attempts_root_column_idx
  ON model_playground_payment_attempts(COALESCE(root_quote_id,quote_id),COALESCE(root_column_id,column_id))
  WHERE superseded_at IS NULL;
CREATE TABLE model_playground_payment_confirmations (
  nonce TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  attempt_ids JSONB NOT NULL CHECK (jsonb_typeof(attempt_ids) = 'array' AND jsonb_array_length(attempt_ids) > 0),
  created_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_root_quote_id TEXT CONSTRAINT model_playground_confirmation_root_fkey REFERENCES model_playground_payment_quotes(id),
  CHECK ((consumed_at IS NULL) = (consumed_root_quote_id IS NULL))
);
CREATE INDEX model_playground_payment_attempts_active_idx
  ON model_playground_payment_attempts(principal, dispatched_at) WHERE observed_at IS NULL;
CREATE TABLE model_playground_payment_observations (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES model_playground_payment_attempts(id),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  accounting_status TEXT NOT NULL DEFAULT 'pending',
  accounting_reason TEXT
);
CREATE FUNCTION model_playground_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'model_playground_payment_quotes' THEN
    IF ROW(NEW.id,NEW.project_id,NEW.actor_id,NEW.principal,NEW.content_hash,NEW.snapshot,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.actor_id,OLD.principal,OLD.content_hash,OLD.snapshot,OLD.created_at)
      OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
      OR (OLD.rejection IS NOT NULL AND NEW.rejection IS DISTINCT FROM OLD.rejection)
      OR (OLD.accepted_at IS NOT NULL AND ROW(NEW.replay_of,NEW.confirmation_key) IS DISTINCT FROM ROW(OLD.replay_of,OLD.confirmation_key)) THEN
      RAISE EXCEPTION 'Immutable model quote';
    END IF;
  ELSIF TG_TABLE_NAME = 'model_playground_payment_confirmations' THEN
    IF ROW(NEW.nonce,NEW.project_id,NEW.actor_id,NEW.content_hash,NEW.attempt_ids,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.nonce,OLD.project_id,OLD.actor_id,OLD.content_hash,OLD.attempt_ids,OLD.created_at)
      OR (OLD.consumed_at IS NOT NULL AND ROW(NEW.consumed_at,NEW.consumed_root_quote_id)
        IS DISTINCT FROM ROW(OLD.consumed_at,OLD.consumed_root_quote_id)) THEN
      RAISE EXCEPTION 'Immutable model confirmation';
    END IF;
  ELSIF TG_TABLE_NAME = 'model_playground_payment_observations' THEN
    IF ROW(NEW.id,NEW.attempt_id,NEW.response,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.attempt_id,OLD.response,OLD.created_at) THEN
      RAISE EXCEPTION 'Immutable model observation';
    END IF;
  ELSE
    IF ROW(NEW.id,NEW.quote_id,NEW.column_id,NEW.namespace,NEW.principal,NEW.binding,NEW.root_quote_id,NEW.root_column_id)
      IS DISTINCT FROM ROW(OLD.id,OLD.quote_id,OLD.column_id,OLD.namespace,OLD.principal,OLD.binding,OLD.root_quote_id,OLD.root_column_id)
      OR (OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at)
      OR (OLD.observed_at IS NOT NULL AND NEW.observed_at IS DISTINCT FROM OLD.observed_at)
      OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
      OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at)
      OR (OLD.refusal_reason IS NOT NULL AND NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason) THEN
      RAISE EXCEPTION 'Immutable model attempt';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER model_playground_payment_quote_guard BEFORE UPDATE ON model_playground_payment_quotes
  FOR EACH ROW EXECUTE FUNCTION model_playground_payment_guard();
CREATE TRIGGER model_playground_payment_attempt_guard BEFORE UPDATE ON model_playground_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION model_playground_payment_guard();
CREATE TRIGGER model_playground_payment_observation_guard BEFORE UPDATE ON model_playground_payment_observations
  FOR EACH ROW EXECUTE FUNCTION model_playground_payment_guard();
CREATE TRIGGER model_playground_payment_confirmation_guard BEFORE UPDATE ON model_playground_payment_confirmations
  FOR EACH ROW EXECUTE FUNCTION model_playground_payment_guard();
