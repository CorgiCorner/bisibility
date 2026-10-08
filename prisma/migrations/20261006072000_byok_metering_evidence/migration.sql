-- Content-free accounting evidence is independent of business-project cascading deletion.
CREATE TABLE metering_usage_evidence (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  provider TEXT NOT NULL,
  feature TEXT NOT NULL,
  source TEXT NOT NULL,
  "credentialKind" TEXT,
  "credentialId" TEXT,
  "correlationId" TEXT NOT NULL,
  unit TEXT NOT NULL,
  estimate JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  receipt JSONB,
  "providerRequestId" TEXT,
  "canonicalId" TEXT,
  discarded BOOLEAN NOT NULL DEFAULT false,
  "measurementStatus" TEXT NOT NULL DEFAULT 'unknown'
);
CREATE INDEX metering_usage_evidence_project_principal_idx ON metering_usage_evidence("projectId",principal,"createdAt");
CREATE INDEX metering_usage_evidence_pending_idx ON metering_usage_evidence("connectionId","correlationId","measurementStatus");
CREATE UNIQUE INDEX metering_usage_evidence_native_idx ON metering_usage_evidence("connectionId","providerRequestId") WHERE "providerRequestId" IS NOT NULL AND "canonicalId" IS NULL;
CREATE FUNCTION metering_usage_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.principal,NEW."projectId",NEW."connectionId",NEW.provider,NEW.feature,
    NEW.source,NEW."credentialKind",NEW."credentialId",NEW."correlationId",NEW.unit,NEW.estimate,NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD.id,OLD.principal,OLD."projectId",OLD."connectionId",OLD.provider,OLD.feature,
    OLD.source,OLD."credentialKind",OLD."credentialId",OLD."correlationId",OLD.unit,OLD.estimate,OLD."createdAt")
  THEN RAISE EXCEPTION 'BYOK accounting identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER metering_usage_identity_immutable BEFORE UPDATE ON metering_usage_evidence
  FOR EACH ROW EXECUTE FUNCTION metering_usage_identity_immutable();
