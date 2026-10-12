-- Retain the historical relation until schema cleanup, while new writes bind to Meter.
ALTER TABLE ai_tracking_suggestion_generations DROP CONSTRAINT ai_generation_completed_evidence;
ALTER TABLE ai_tracking_suggestion_generations ADD CONSTRAINT ai_generation_completed_evidence CHECK (
  state <> 'completed' OR (
    result IS NOT NULL AND evidence IS NOT NULL AND "usageTag" IS NOT NULL AND "resultHash" IS NOT NULL
    AND (
      "providerCostEntryId" IS NOT NULL OR (
        COALESCE(receipt->'operationRef'->>'version' = '1',false)
        AND COALESCE(length(receipt->'operationRef'->>'namespace'),0) > 0
        AND COALESCE(length(receipt->'operationRef'->>'operationId'),0) > 0
      )
    )
  )
);
