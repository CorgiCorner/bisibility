-- AlterTable
ALTER TABLE "provider_connection_recovery" ADD COLUMN     "lastManualCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastProbeOutcome" TEXT,
ADD COLUMN     "providerCooldownUntil" TIMESTAMP(3);
