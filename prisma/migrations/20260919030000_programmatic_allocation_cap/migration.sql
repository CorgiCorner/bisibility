ALTER TABLE "provider_connections" ADD COLUMN "programmaticAllocationAmountPerMonth" INTEGER;

-- Copy each existing app cap into the programmatic cap so the migration loosens nothing.
UPDATE "provider_connections"
SET "programmaticAllocationAmountPerMonth" = "allocationAmountPerMonth"
WHERE "allocationAmountPerMonth" IS NOT NULL;
