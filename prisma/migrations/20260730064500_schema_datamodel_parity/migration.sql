ALTER TYPE "ProviderCostFeature" ADD VALUE IF NOT EXISTS 'backlinks';

ALTER TABLE "provider_connection_rates"
ALTER COLUMN "updatedAt" DROP DEFAULT;
