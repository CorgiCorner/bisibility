ALTER TABLE "notifications"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);

ALTER TABLE "provider_incident_operations" ADD COLUMN "customerEvidence" JSONB;

-- Keep existing neutral keys valid, and admit canonical provider:feature grouping.
ALTER TABLE "provider_incidents" DROP CONSTRAINT "provider_incidents_cause_check";
ALTER TABLE "provider_incidents" ADD CONSTRAINT "provider_incidents_cause_check"
  CHECK ("cause" ~ '^[a-z][a-z0-9_]{0,63}(:[a-z][a-z0-9_]{0,63})?$');
