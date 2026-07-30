-- Add ownership to transient delivery claims so retries cannot release another worker's rows.
ALTER TABLE "triggered_alerts" ADD COLUMN "deliveryClaimToken" TEXT;
