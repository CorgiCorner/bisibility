-- ADR-020 amendment 2026-10-27: allow the owner-approved live-connection closeout policy.
-- Forward-only, no down migration. A constraint swap on the small append-only disposition
-- table: no column, data, trigger or disposition change and no table rewrite. The original
-- closeout migration is frozen. The explicit transaction makes the lock timeout apply; the
-- ACCESS EXCLUSIVE lock is held until COMMIT, including the short validation of existing rows.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE metering_history_closeout
  DROP CONSTRAINT metering_history_closeout_policy_check,
  ADD CONSTRAINT metering_history_closeout_policy_check
  CHECK (policy IN ('known-cost-incomplete-byok-v1', 'known-cost-incomplete-byok-live-connection-v1'));

COMMIT;
