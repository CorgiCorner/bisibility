ALTER TABLE "ai_tracking_runs"
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "reasonDetails" JSONB;
