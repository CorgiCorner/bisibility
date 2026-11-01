-- Explicit retired-project/retained-configuration policy. Existing policy meanings stay frozen.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE metering_history_closeout
  DROP CONSTRAINT metering_history_closeout_policy_check,
  ADD CONSTRAINT metering_history_closeout_policy_check
  CHECK (policy IN (
    'known-cost-incomplete-byok-v1',
    'known-cost-incomplete-byok-live-connection-v1',
    'known-cost-incomplete-byok-retired-settings-v1'
  ));
COMMIT;
