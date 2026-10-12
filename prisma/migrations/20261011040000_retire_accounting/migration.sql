-- Immutable snapshots precede retirement; the deploy-blocking data migration imports them.
DO $$
BEGIN
  IF to_regclass('provider_cost_entries') IS NOT NULL THEN
    IF to_regclass('metering_legacy_usage_source') IS NULL THEN
      RAISE EXCEPTION 'Historical usage snapshot is required before ledger retirement';
    END IF;
    IF EXISTS (SELECT 1 FROM provider_cost_entries p LEFT JOIN metering_legacy_usage_source s ON s.source_id=p.id WHERE s.source_id IS NULL) THEN
      RAISE EXCEPTION 'Unsnapshotted provider usage prevents ledger retirement';
    END IF;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION provider_ui_connection_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."provider", NEW."status", NEW."priority", NEW."enabled", NEW."credentialsEncrypted",
    NEW."credentialSource", NEW."costPerCheckCents", NEW."publicId", NEW."projectId")
    IS DISTINCT FROM ROW(OLD."provider", OLD."status", OLD."priority", OLD."enabled", OLD."credentialsEncrypted",
    OLD."credentialSource", OLD."costPerCheckCents", OLD."publicId", OLD."projectId") THEN
    NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
  ELSE
    NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION provider_ui_project_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."ownerId", NEW."writeMode", NEW."isSample", NEW."budgetCapCents")
    IS DISTINCT FROM ROW(OLD."ownerId", OLD."writeMode", OLD."isSample", OLD."budgetCapCents") THEN
    NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
  ELSE
    NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE projects DROP COLUMN IF EXISTS "providerAllocationsInitializedAt";
ALTER TABLE provider_connections
  DROP COLUMN IF EXISTS "allocationAmountPerMonth",
  DROP COLUMN IF EXISTS "allocationUnit",
  DROP COLUMN IF EXISTS "programmaticAllocationAmountPerMonth",
  DROP COLUMN IF EXISTS "creditsAllocationAmountPerMonth",
  DROP COLUMN IF EXISTS "creditsProgrammaticAllocationAmountPerMonth";
ALTER TABLE IF EXISTS ai_tracking_samples DROP COLUMN IF EXISTS "providerCostEntryId";
ALTER TABLE IF EXISTS ai_tracking_suggestion_generations DROP COLUMN IF EXISTS "providerCostEntryId";
DROP TABLE IF EXISTS provider_cost_entries;
DROP TABLE IF EXISTS metering_shadow;
-- costPerCheckCents and provider_connection_rates remain for the rates migration.

DO $$
BEGIN
 IF to_regclass('ai_tracking_suggestion_generations') IS NOT NULL THEN
  ALTER TABLE ai_tracking_suggestion_generations ADD CONSTRAINT ai_generation_completed_evidence CHECK (
   state <> 'completed' OR (result IS NOT NULL AND evidence IS NOT NULL AND "usageTag" IS NOT NULL AND "resultHash" IS NOT NULL
    AND COALESCE(receipt->'operationRef'->>'version'='1',false)
    AND COALESCE(length(receipt->'operationRef'->>'namespace'),0)>0
    AND COALESCE(length(receipt->'operationRef'->>'operationId'),0)>0)) NOT VALID;
 END IF;
END $$;
