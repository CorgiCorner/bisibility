ALTER TYPE "ProviderCostFeature" ADD VALUE IF NOT EXISTS 'ai_assistant';
ALTER TABLE "assistant_runs" DROP COLUMN IF EXISTS "grantId";
ALTER TABLE "assistant_attempts" ADD COLUMN IF NOT EXISTS "creditHoldId" TEXT;
DROP TABLE IF EXISTS "assistant_grants";
