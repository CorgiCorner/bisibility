-- CreateEnum
CREATE TYPE "ProviderAllocationUnit" AS ENUM ('cents', 'units');

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "providerAllocationsInitializedAt" TIMESTAMP(3);

ALTER TABLE "provider_connections"
ADD COLUMN "allocationUnit" "ProviderAllocationUnit",
ADD COLUMN "allocationAmountPerMonth" INTEGER,
ADD CONSTRAINT "provider_connections_allocation_pair" CHECK (
  ("allocationUnit" IS NULL AND "allocationAmountPerMonth" IS NULL)
  OR
  (
    "allocationUnit" IS NOT NULL
    AND "allocationAmountPerMonth" IS NOT NULL
    AND "allocationAmountPerMonth" > 0
  )
);

-- AlterTable
ALTER TABLE "provider_cost_entries"
ADD COLUMN "usageQuantity" DECIMAL(18,6),
ADD CONSTRAINT "provider_cost_entries_usage_quantity_positive" CHECK (
  "usageQuantity" IS NULL OR "usageQuantity" > 0
);

-- DuplicatePreflight
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "provider_cost_entries"
    WHERE "providerRequestId" IS NOT NULL
    GROUP BY "connectionId", "providerRequestId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce provider request uniqueness: duplicate non-null connection/request identifiers exist. Reconcile duplicate ledger rows before retrying this migration.';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "provider_cost_entries_connection_request_key"
ON "provider_cost_entries"("connectionId", "providerRequestId")
WHERE "providerRequestId" IS NOT NULL;
