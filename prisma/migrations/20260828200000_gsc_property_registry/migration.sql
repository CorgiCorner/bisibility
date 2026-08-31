-- CreateEnum
CREATE TYPE "SearchInsightsPropertyStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "gsc_property_registry" (
    "projectId" TEXT NOT NULL,
    "propertyKey" TEXT NOT NULL,
    "status" "SearchInsightsPropertyStatus" NOT NULL,
    "ga4PropertyId" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "gsc_property_registry_pkey" PRIMARY KEY ("projectId", "propertyKey")
);

-- CreateIndex
CREATE INDEX "gsc_property_registry_projectId_status_idx" ON "gsc_property_registry"("projectId", "status");

-- Enforce the one-syncing-property invariant in the database.
CREATE UNIQUE INDEX "gsc_property_registry_one_active_per_project_idx"
ON "gsc_property_registry"("projectId")
WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "gsc_property_registry" ADD CONSTRAINT "gsc_property_registry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Credential payloads are encrypted, so SQL must not attempt to inspect them to infer a current
-- selection. Preserve every historical GSC data key as archived. The authenticated save path must
-- activate the current normalized property after decrypting credentials in application memory.
WITH "historical_properties" AS (
    SELECT "projectId", "property", MIN("createdAt") AS "activatedAt"
    FROM "search_analytics_imports"
    WHERE "source" = 'gsc'
    GROUP BY "projectId", "property"

    UNION

    SELECT "projectId", "property", MIN("createdAt") AS "activatedAt"
    FROM "search_analytics_sync_partitions"
    WHERE "source" = 'gsc'
    GROUP BY "projectId", "property"
), "historical_property_activations" AS (
    SELECT "projectId", "property", MIN("activatedAt") AS "activatedAt"
    FROM "historical_properties"
    GROUP BY "projectId", "property"
)
INSERT INTO "gsc_property_registry" (
    "projectId",
    "propertyKey",
    "status",
    "activatedAt",
    "archivedAt"
)
SELECT
    "projectId",
    "property",
    'archived'::"SearchInsightsPropertyStatus",
    "activatedAt",
    CURRENT_TIMESTAMP
FROM "historical_property_activations";
