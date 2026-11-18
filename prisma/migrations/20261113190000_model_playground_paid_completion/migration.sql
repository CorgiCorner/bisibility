-- Permit a bound paid answer to finish after its execution lease expires.
CREATE OR REPLACE FUNCTION guard_model_playground_column() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen JSONB; paid_completion BOOLEAN := false;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT snapshot INTO frozen FROM model_playground_runs WHERE "projectId"=NEW."projectId" AND id=NEW."runId";
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(frozen->'input'->'columns') c WHERE c=NEW.config)
      OR NEW.state<>'queued'
      OR model_playground_live_connection(NEW."projectId",NEW."connectionId",NEW."liveConnectionId",NEW."liveConnectionProjectId",NEW."providerId") IS NOT TRUE THEN
      RAISE EXCEPTION 'Model Playground column binding mismatch';
    END IF;
  ELSE
    -- Allow only a pure, one-way detach, including terminal rows changed by ON DELETE SET NULL.
    IF (NEW."liveConnectionId",NEW."liveConnectionProjectId") IS DISTINCT FROM (OLD."liveConnectionId",OLD."liveConnectionProjectId") THEN
      IF OLD."liveConnectionId" IS NULL OR NEW."liveConnectionId" IS NOT NULL OR NEW."liveConnectionProjectId" IS NOT NULL
        OR (to_jsonb(NEW)-ARRAY['liveConnectionId','liveConnectionProjectId']) IS DISTINCT FROM
           (to_jsonb(OLD)-ARRAY['liveConnectionId','liveConnectionProjectId']) THEN
        RAISE EXCEPTION 'Model Playground live connection is immutable';
      END IF;
      RETURN NEW;
    END IF;
    IF ((NEW.state='claimed' AND (OLD.state='queued' OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken"))
      OR (NEW."dispatchStartedAt" IS NOT NULL AND OLD."dispatchStartedAt" IS NULL))
      AND model_playground_live_connection(NEW."projectId",NEW."connectionId",NEW."liveConnectionId",NEW."liveConnectionProjectId",NEW."providerId") IS NOT TRUE THEN
      RAISE EXCEPTION 'Model Playground disconnected attempt is fenced';
    END IF;
    IF (NEW.id,NEW."projectId",NEW."runId",NEW."columnId",NEW."connectionId",NEW."providerId",NEW.config,NEW."operationKey")
      IS DISTINCT FROM (OLD.id,OLD."projectId",OLD."runId",OLD."columnId",OLD."connectionId",OLD."providerId",OLD.config,OLD."operationKey") THEN
      RAISE EXCEPTION 'Model Playground column is immutable';
    END IF;
    -- A late paid answer may finish an expired lease, never replace a retained answer.
    IF OLD.result IS NULL AND NEW.result IS NOT NULL AND OLD.state IN ('claimed','unknown')
      AND OLD."dispatchStartedAt" IS NOT NULL
      AND (to_jsonb(NEW)-ARRAY['state','result','finishedAt']) IS NOT DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['state','result','finishedAt']) THEN
      SELECT EXISTS (
        SELECT 1 FROM model_playground_payment_attempts a
        JOIN model_playground_runs r ON r.id=NEW."runId" AND r."projectId"=NEW."projectId"
        WHERE COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
          AND COALESCE(a.root_column_id,a.column_id)=NEW."columnId"
          AND (a.binding->>'projectId')=NEW."projectId" AND a.dispatched_at IS NOT NULL
          AND a.superseded_at IS NULL
      ) INTO paid_completion;
    END IF;
    IF (OLD.state NOT IN ('queued','claimed') AND NEW IS DISTINCT FROM OLD AND NOT paid_completion)
      OR (OLD."dispatchStartedAt" IS NOT NULL AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt")
      OR (OLD.state='claimed' AND NEW.state='queued') THEN
      RAISE EXCEPTION 'Model Playground attempt is immutable';
    END IF;
    IF NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken" AND OLD.state='claimed'
      AND (OLD."dispatchStartedAt" IS NOT NULL OR OLD."leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC')) THEN
      RAISE EXCEPTION 'Model Playground lease is fenced';
    END IF;
    IF NEW."dispatchStartedAt" IS NOT NULL AND OLD."dispatchStartedAt" IS NULL
      AND (OLD.state<>'claimed' OR OLD."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken") THEN
      RAISE EXCEPTION 'Model Playground dispatch is fenced';
    END IF;
    IF NEW.state NOT IN ('queued','claimed') AND OLD.state IN ('queued','claimed') THEN
      IF NOT paid_completion AND (OLD.state<>'claimed' OR (OLD."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') AND NOT
        (NEW.state='unknown' AND NEW.result IS NULL AND OLD."dispatchStartedAt" IS NOT NULL))
        OR (NEW.state IN ('completed','partial','unknown') AND OLD."dispatchStartedAt" IS NULL)) THEN
        RAISE EXCEPTION 'Model Playground completion is fenced';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
