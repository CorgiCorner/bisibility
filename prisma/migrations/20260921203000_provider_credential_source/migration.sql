-- CreateEnum
CREATE TYPE "ProviderCredentialSource" AS ENUM ('own', 'hosted');

-- AlterTable
ALTER TABLE "provider_connections" ADD COLUMN "credentialSource" "ProviderCredentialSource" NOT NULL DEFAULT 'own';

-- AlterTable
ALTER TABLE "provider_cost_entries" ADD COLUMN "credentialSource" "ProviderCredentialSource" NOT NULL DEFAULT 'own',
ADD COLUMN "priceCents" DECIMAL(10,4);
