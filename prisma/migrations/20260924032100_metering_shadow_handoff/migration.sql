ALTER TABLE metering_shadow
  ADD COLUMN handoff_lease_id text,
  ADD COLUMN handoff_kind text CHECK (handoff_kind IN ('lease','recovery')),
  ADD COLUMN handoff_expires_at timestamptz;
