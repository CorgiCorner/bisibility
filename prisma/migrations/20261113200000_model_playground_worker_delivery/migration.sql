ALTER TABLE model_playground_runs
  ADD COLUMN "workerRequestedAt" TIMESTAMP(3),
  ADD COLUMN "workerProbeAt" TIMESTAMP(3),
  ADD COLUMN "terminalAt" TIMESTAMP(3),
  ADD COLUMN "terminalRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("terminalRevision">=0),
  ADD COLUMN "terminalHookDeliveredRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("terminalHookDeliveredRevision">=0 AND "terminalHookDeliveredRevision"<="terminalRevision"),
  ADD COLUMN "terminalHookAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "terminalHookNextAt" TIMESTAMPTZ(3),
  ADD COLUMN "terminalHookAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "terminalHookAttemptBase" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT model_playground_hook_attempt_check CHECK (
    "terminalHookAttempts">=0 AND "terminalHookAttemptBase">=0
    AND "terminalHookAttemptBase"<="terminalHookAttempts"
    AND "terminalHookAttempts"-"terminalHookAttemptBase"<=5
  ),
  ADD COLUMN "terminalHookStoppedAt" TIMESTAMPTZ(3),
  ADD COLUMN "terminalHookStoppedRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT model_playground_hook_stop_revision_check CHECK (
    "terminalHookStoppedRevision">=0 AND "terminalHookStoppedRevision"<="terminalRevision"
  ),
  ADD COLUMN "terminalHookAttemptRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT model_playground_hook_attempt_revision_check CHECK (
    "terminalHookAttemptRevision">=0 AND "terminalHookAttemptRevision"<="terminalRevision"
  ),
  ADD COLUMN "workerRecoveryAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("workerRecoveryAttempts" BETWEEN 0 AND 101),
  ADD COLUMN "recoveryStoppedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT model_playground_worker_intent_check CHECK (
    "workerRequestedAt" IS NULL OR "workerProbeAt" IS NOT NULL
  );
CREATE INDEX model_playground_worker_pending_idx
  ON model_playground_runs ("workerProbeAt", id)
  WHERE "workerRequestedAt" IS NOT NULL AND "terminalAt" IS NULL AND "recoveryStoppedAt" IS NULL;
CREATE INDEX model_playground_stopped_recovery_idx ON model_playground_runs ("workerProbeAt",id)
  WHERE "terminalAt" IS NULL AND "recoveryStoppedAt" IS NOT NULL;
-- Probe may be null on the first visit, so that row has to be in the index.
CREATE INDEX model_playground_inline_fence_idx ON model_playground_runs ("workerProbeAt",id)
  WHERE "terminalAt" IS NULL AND "workerRequestedAt" IS NULL;
CREATE INDEX model_playground_terminal_hook_idx ON model_playground_runs ("terminalHookNextAt",id)
  WHERE "terminalAt" IS NOT NULL AND "terminalHookDeliveredRevision"<"terminalRevision"
    AND ("terminalHookStoppedAt" IS NULL OR "terminalRevision">"terminalHookStoppedRevision");

-- Historical terminal runs are already delivered, including those without a saved report.
-- Enabling report delivery must not create reports for old runs.
UPDATE model_playground_runs r SET "terminalAt"=(clock_timestamp() AT TIME ZONE 'UTC'),
  "terminalRevision"=1,"terminalHookDeliveredRevision"=1
  WHERE NOT EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id AND c.state IN ('queued','claimed'));

CREATE FUNCTION guard_model_playground_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."workerRequestedAt" IS NOT NULL AND NEW."workerRequestedAt" IS DISTINCT FROM OLD."workerRequestedAt")
    OR (OLD."recoveryStoppedAt" IS NOT NULL AND NEW."recoveryStoppedAt" IS DISTINCT FROM OLD."recoveryStoppedAt")
    OR (OLD."terminalHookStoppedAt" IS NOT NULL AND NEW."terminalHookStoppedAt" IS DISTINCT FROM OLD."terminalHookStoppedAt")
    OR NEW."terminalHookStoppedRevision"<OLD."terminalHookStoppedRevision"
    OR NEW."terminalHookAttemptRevision"<OLD."terminalHookAttemptRevision"
    OR NEW."terminalHookAttempts"<OLD."terminalHookAttempts"
    OR NEW."terminalHookAttemptBase"<OLD."terminalHookAttemptBase"
    OR NEW."workerRecoveryAttempts"<OLD."workerRecoveryAttempts"
    OR NEW."terminalRevision"<OLD."terminalRevision"
    OR NEW."terminalHookDeliveredRevision"<OLD."terminalHookDeliveredRevision"
    OR (OLD."terminalAt" IS NOT NULL AND NEW."terminalAt" IS DISTINCT FROM OLD."terminalAt")
    OR (NEW."terminalAt" IS NOT NULL AND EXISTS (
      SELECT 1 FROM model_playground_columns WHERE "runId"=NEW.id AND state IN ('queued','claimed')
    )) THEN
    RAISE EXCEPTION 'Model Playground delivery is fenced';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER model_playground_delivery_guard BEFORE UPDATE ON model_playground_runs
  FOR EACH ROW EXECUTE FUNCTION guard_model_playground_delivery();

-- Permit a bound paid answer to finish after its execution lease expires.
CREATE OR REPLACE FUNCTION guard_model_playground_column() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen JSONB; bound_completion BOOLEAN := false;
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
      ) INTO bound_completion;
    END IF;
    -- A durable pre-send refusal can finish even after live credential custody is detached.
    IF OLD.result IS NULL AND OLD.state IN ('queued','claimed') AND OLD."dispatchStartedAt" IS NULL
      AND NEW.state='cancelled' AND NEW.result->>'failure'='refused'
      AND (to_jsonb(NEW)-ARRAY['state','result','finishedAt']) IS NOT DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['state','result','finishedAt']) THEN
      SELECT EXISTS (
        SELECT 1 FROM model_playground_payment_attempts a
        JOIN model_playground_runs r ON r.id=NEW."runId" AND r."projectId"=NEW."projectId"
        WHERE COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
          AND COALESCE(a.root_column_id,a.column_id)=NEW."columnId"
          AND (a.binding->>'projectId')=NEW."projectId" AND a.dispatched_at IS NULL
          AND a.refusal_reason IS NOT NULL AND a.superseded_at IS NULL
      ) INTO bound_completion;
    END IF;
    IF (OLD.state NOT IN ('queued','claimed') AND NEW IS DISTINCT FROM OLD AND NOT bound_completion)
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
      IF NOT bound_completion AND (OLD.state<>'claimed' OR (OLD."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') AND NOT
        (NEW.state='unknown' AND NEW.result IS NULL AND OLD."dispatchStartedAt" IS NOT NULL))
        OR (NEW.state IN ('completed','partial','unknown') AND OLD."dispatchStartedAt" IS NULL)) THEN
        RAISE EXCEPTION 'Model Playground completion is fenced';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
