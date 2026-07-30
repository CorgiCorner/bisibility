-- Add queue claim metadata and prevent historical undelivered rows from being resent.
ALTER TABLE "triggered_alerts"
ADD COLUMN "deliveryClaimedAt" TIMESTAMP(3),
ADD COLUMN "deliveryBudgetReservedAt" TIMESTAMP(3);

UPDATE "triggered_alerts"
SET "deliveryState" = CASE
  WHEN "deliveredAt" IS NOT NULL THEN 'delivered'::"AlertDeliveryState"
  ELSE 'dead_letter'::"AlertDeliveryState"
END;
