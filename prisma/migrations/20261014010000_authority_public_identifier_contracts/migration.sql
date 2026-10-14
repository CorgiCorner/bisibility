-- Keep the public resource registry contract without rewriting applied expand migrations.
-- The three existing format checks already enforce these exact registered prefixes.
ALTER TABLE "local_measurement_targets"
  RENAME CONSTRAINT "local_targets_public_id_check"
  TO "local_measurement_targets_public_id_contract_format";
ALTER TABLE "local_measurement_runs"
  RENAME CONSTRAINT "local_runs_public_id_check"
  TO "local_measurement_runs_public_id_contract_format";
ALTER TABLE "local_monitor_launch_intents"
  RENAME CONSTRAINT "local_monitor_launch_intents_publicId_check"
  TO "local_monitor_launch_intents_public_id_contract_format";

-- Separate validation from the short table-definition lock. Completion requires validation.
ALTER TABLE "business_locations"
  ADD CONSTRAINT "business_locations_public_id_contract_format"
  CHECK ("publicId" ~ '^biz_[a-z][a-z0-9]{23}$') NOT VALID;
ALTER TABLE "business_locations"
  VALIDATE CONSTRAINT "business_locations_public_id_contract_format";
