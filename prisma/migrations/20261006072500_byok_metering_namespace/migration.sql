-- Unknown historical namespaces are never inferred from the current deployment.
ALTER TABLE metering_usage_evidence ADD COLUMN namespace TEXT;
CREATE OR REPLACE FUNCTION metering_usage_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.namespace,NEW.principal,NEW."projectId",NEW."connectionId",NEW.provider,NEW.feature,
    NEW.source,NEW."credentialKind",NEW."credentialId",NEW."correlationId",NEW.unit,NEW.estimate,NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD.id,OLD.namespace,OLD.principal,OLD."projectId",OLD."connectionId",OLD.provider,OLD.feature,
    OLD.source,OLD."credentialKind",OLD."credentialId",OLD."correlationId",OLD.unit,OLD.estimate,OLD."createdAt")
  THEN RAISE EXCEPTION 'BYOK accounting identity is immutable'; END IF;
  IF (OLD."providerRequestId" IS NOT NULL AND NEW."providerRequestId" IS DISTINCT FROM OLD."providerRequestId")
    OR (OLD."canonicalId" IS NOT NULL AND NEW."canonicalId" IS DISTINCT FROM OLD."canonicalId")
  THEN RAISE EXCEPTION 'BYOK accounting proof identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
