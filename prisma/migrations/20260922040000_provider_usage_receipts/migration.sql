ALTER TABLE "provider_cost_entries"
ADD COLUMN "measurementStatus" VARCHAR(16) NOT NULL DEFAULT 'recorded',
ADD CONSTRAINT "provider_cost_entries_measurement_status_check"
CHECK ("measurementStatus" IN ('recorded', 'unknown'));

ALTER TABLE "provider_cost_entries"
DROP CONSTRAINT "provider_cost_entries_usage_quantity_positive";

ALTER TABLE "provider_cost_entries"
ADD CONSTRAINT "provider_cost_entries_usage_quantity_check"
CHECK ("usageQuantity" IS NULL OR "usageQuantity" >= 0);

CREATE INDEX "provider_cost_entries_unconfirmed_age_idx"
ON "provider_cost_entries" ("createdAt", "id")
WHERE "measurementStatus" = 'unknown';
