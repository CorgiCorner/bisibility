CREATE TABLE provider_comparison_previews (
  id TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "actorId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "keywordId" TEXT REFERENCES keywords(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL, "sourceHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("projectId",id)
);
CREATE INDEX provider_comparison_previews_projectId_createdAt_idx ON provider_comparison_previews("projectId","createdAt");
CREATE TABLE provider_comparison_runs (
  id TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "actorId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "keywordId" TEXT REFERENCES keywords(id) ON DELETE SET NULL,
  "requestKey" TEXT NOT NULL, "previewId" TEXT NOT NULL,
  snapshot JSONB NOT NULL, "sourceHash" TEXT NOT NULL,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("projectId","requestKey"), UNIQUE ("projectId",id),
  FOREIGN KEY ("projectId","previewId") REFERENCES provider_comparison_previews("projectId",id) ON DELETE CASCADE
);
CREATE INDEX provider_comparison_runs_projectId_createdAt_idx ON provider_comparison_runs("projectId","createdAt");
CREATE TABLE provider_comparison_sides (
  id TEXT PRIMARY KEY, "runId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('dataforseo','serpapi')),
  "connectionId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','claimed','completed','failed','unknown','cancelled')),
  "claimToken" TEXT, "requestKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attemptIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "costCents" DECIMAL(12,4), "customerCostCents" DECIMAL(12,4), quantity DECIMAL(18,6), reason TEXT, result JSONB,
  "claimedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
  UNIQUE("runId",provider),
  FOREIGN KEY("projectId","runId") REFERENCES provider_comparison_runs("projectId",id) ON DELETE CASCADE,
  CHECK("costCents" IS NULL OR "costCents">=0), CHECK(quantity IS NULL OR quantity>=0), CHECK("customerCostCents" IS NULL OR "customerCostCents">=0)
);
CREATE INDEX provider_comparison_sides_projectId_status_idx ON provider_comparison_sides("projectId",status);
CREATE FUNCTION guard_provider_comparison_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."projectId",NEW."sourceHash",NEW.snapshot) IS DISTINCT FROM (OLD."projectId",OLD."sourceHash",OLD.snapshot) THEN
    RAISE EXCEPTION 'Comparison snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_comparison_previews_immutable BEFORE UPDATE ON provider_comparison_previews FOR EACH ROW EXECUTE FUNCTION guard_provider_comparison_snapshot();
CREATE TRIGGER provider_comparison_runs_immutable BEFORE UPDATE ON provider_comparison_runs FOR EACH ROW EXECUTE FUNCTION guard_provider_comparison_snapshot();
