-- Hosted pricing feedback: nullable answer columns on the waitlist row.
ALTER TABLE "waitlists" ADD COLUMN "hostedPrice" TEXT;
ALTER TABLE "waitlists" ADD COLUMN "hostedPriceAnsweredAt" TIMESTAMP(3);
