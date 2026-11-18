-- Dispatch timestamps are real instants. Infinity is not a date the driver can return.
SET LOCAL lock_timeout = '5s';

ALTER TABLE model_playground_columns
  ADD CONSTRAINT model_playground_columns_dispatch_finite
  CHECK ("dispatchStartedAt" IS NULL OR isfinite("dispatchStartedAt"));

ALTER TABLE model_playground_payment_attempts
  ADD CONSTRAINT model_playground_payment_attempts_dispatch_finite
  CHECK (dispatched_at IS NULL OR isfinite(dispatched_at));
