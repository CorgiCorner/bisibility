ALTER TABLE "triggered_alerts" ADD COLUMN "digestSubmissionStarted" BOOLEAN;
ALTER TABLE "triggered_alerts" ALTER COLUMN "digestSubmissionStarted" SET DEFAULT FALSE;
ALTER TABLE "roadmap_deliveries" ADD COLUMN "submissionStarted" BOOLEAN;
CREATE TABLE "alert_digest_sends" (
  "alertId" TEXT NOT NULL REFERENCES "triggered_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "ownerToken" TEXT NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('submitting', 'accepted', 'unknown', 'skipped', 'retryable', 'failed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("alertId", "channel", "destination")
);

-- Old sweepers cannot distinguish a queued activity from an accepted send.
CREATE FUNCTION fence_digest_reclaim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."deliveryState" = 'digest_pending' AND NEW."deliveryState" = 'digesting' THEN
    IF OLD."digestSubmissionStarted" IS NULL OR
       current_setting('bisibility.digest_claim_owner', true) IS DISTINCT FROM NEW."deliveryClaimToken" THEN
      NEW."digestSubmissionStarted" := NULL;
    ELSE
      NEW."digestSubmissionStarted" := FALSE;
    END IF;
  END IF;
  IF OLD."deliveryState" = 'digesting' AND
     (NEW."deliveryState" = 'digest_pending' OR
      (NEW."deliveryState" = 'digesting' AND NEW."deliveryClaimToken" IS DISTINCT FROM OLD."deliveryClaimToken")) THEN
    IF OLD."digestSubmissionStarted" IS FALSE AND
       current_setting('bisibility.digest_release_owner', true) = OLD."deliveryClaimToken" THEN
      NEW."digestSubmissionStarted" := FALSE;
      RETURN NEW;
    END IF;
    -- Retain uncertainty for transactional recovery, which also persists bell rows.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER digest_reclaim_fence BEFORE UPDATE ON "triggered_alerts"
FOR EACH ROW EXECUTE FUNCTION fence_digest_reclaim();

-- New owners authorize writes transactionally; unchanged workers cannot replace them.
CREATE FUNCTION fence_roadmap_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."submissionStarted" IS NOT NULL THEN
    IF OLD."claimToken" IS NOT NULL AND
       current_setting('bisibility.roadmap_write_owner', true) = OLD."claimToken" THEN
      RETURN NEW;
    END IF;
    IF OLD."submissionStarted" IS FALSE AND NEW."state" = 'sending' AND
       NEW."submissionStarted" IS FALSE AND
       current_setting('bisibility.roadmap_claim_owner', true) = NEW."claimToken" THEN
      RETURN NEW;
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."state" = 'sending' AND NEW."claimToken" IS DISTINCT FROM OLD."claimToken" THEN
    IF current_setting('bisibility.roadmap_claim_owner', true) = NEW."claimToken" THEN
      NEW."submissionStarted" := FALSE;
    ELSE
      NEW."submissionStarted" := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER roadmap_delivery_fence BEFORE UPDATE ON "roadmap_deliveries"
FOR EACH ROW EXECUTE FUNCTION fence_roadmap_delivery();
