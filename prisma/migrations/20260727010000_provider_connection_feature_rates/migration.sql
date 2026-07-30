ALTER TABLE "provider_cost_entries"
ALTER COLUMN "feature" DROP DEFAULT;

CREATE TYPE "ProviderCostFeature_new" AS ENUM (
    'keyword_metrics',
    'keyword_research',
    'rank_check',
    'ranked_keywords'
);

ALTER TABLE "provider_cost_entries"
ALTER COLUMN "feature" TYPE "ProviderCostFeature_new"
USING ("feature"::text::"ProviderCostFeature_new");

DROP TYPE "ProviderCostFeature";
ALTER TYPE "ProviderCostFeature_new" RENAME TO "ProviderCostFeature";

ALTER TABLE "provider_cost_entries"
ALTER COLUMN "feature" SET DEFAULT 'ranked_keywords';

CREATE TABLE "provider_connection_rates" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "feature" "ProviderCostFeature" NOT NULL,
    "amountCents" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_connection_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_connection_rates_connectionId_feature_key"
ON "provider_connection_rates"("connectionId", "feature");

CREATE INDEX "provider_connection_rates_connectionId_idx"
ON "provider_connection_rates"("connectionId");

ALTER TABLE "provider_connection_rates"
ADD CONSTRAINT "provider_connection_rates_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "provider_connection_rates" (
    "id",
    "connectionId",
    "feature",
    "amountCents"
)
SELECT
    'migrated_' || "id" || '_rank_check',
    "id",
    'rank_check',
    "costPerCheckCents"
FROM "provider_connections"
WHERE "costPerCheckCents" IS NOT NULL;
