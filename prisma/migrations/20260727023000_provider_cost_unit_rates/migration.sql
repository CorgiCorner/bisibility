ALTER TABLE "provider_cost_entries"
ADD COLUMN "unitCostCents" DECIMAL(10,4);

CREATE INDEX "provider_cost_entries_connectionId_feature_createdAt_idx"
ON "provider_cost_entries"("connectionId", "feature", "createdAt");
