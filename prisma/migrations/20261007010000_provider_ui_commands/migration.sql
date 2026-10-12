ALTER TABLE "projects" ADD COLUMN "providerUiRevision" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "provider_connections" ADD COLUMN "providerUiRevision" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "provider_ui_authority" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instanceId" TEXT NOT NULL UNIQUE
);
CREATE TABLE "provider_ui_commands" (
  "scope" TEXT NOT NULL,
  "principal" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("scope", "principal", "commandId")
);

CREATE FUNCTION provider_ui_connection_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."provider", NEW."status", NEW."priority", NEW."enabled", NEW."credentialsEncrypted",
    NEW."credentialSource", NEW."costPerCheckCents", NEW."allocationUnit", NEW."allocationAmountPerMonth",
    NEW."programmaticAllocationAmountPerMonth", NEW."creditsAllocationAmountPerMonth",
    NEW."creditsProgrammaticAllocationAmountPerMonth", NEW."publicId", NEW."projectId")
    IS DISTINCT FROM ROW(OLD."provider", OLD."status", OLD."priority", OLD."enabled", OLD."credentialsEncrypted",
    OLD."credentialSource", OLD."costPerCheckCents", OLD."allocationUnit", OLD."allocationAmountPerMonth",
    OLD."programmaticAllocationAmountPerMonth", OLD."creditsAllocationAmountPerMonth",
    OLD."creditsProgrammaticAllocationAmountPerMonth", OLD."publicId", OLD."projectId") THEN
    NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
  ELSE
    NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provider_ui_connection_revision BEFORE UPDATE ON "provider_connections"
  FOR EACH ROW EXECUTE FUNCTION provider_ui_connection_revision();

CREATE FUNCTION provider_ui_project_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."ownerId", NEW."writeMode", NEW."isSample", NEW."budgetCapCents", NEW."providerAllocationsInitializedAt")
    IS DISTINCT FROM ROW(OLD."ownerId", OLD."writeMode", OLD."isSample", OLD."budgetCapCents", OLD."providerAllocationsInitializedAt") THEN
    NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
  ELSE
    NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provider_ui_project_revision BEFORE UPDATE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION provider_ui_project_revision();

CREATE FUNCTION provider_ui_rate_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "provider_connections" SET "providerUiRevision" = "providerUiRevision" + 1 WHERE "id" = OLD."connectionId";
    RETURN OLD;
  END IF;
  UPDATE "provider_connections" SET "providerUiRevision" = "providerUiRevision" + 1 WHERE "id" = NEW."connectionId";
  IF TG_OP = 'UPDATE' AND OLD."connectionId" IS DISTINCT FROM NEW."connectionId" THEN
    UPDATE "provider_connections" SET "providerUiRevision" = "providerUiRevision" + 1 WHERE "id" = OLD."connectionId";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provider_ui_rate_revision AFTER INSERT OR UPDATE OR DELETE ON "provider_connection_rates"
  FOR EACH ROW EXECUTE FUNCTION provider_ui_rate_revision();

CREATE FUNCTION provider_ui_command_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'provider UI command journal is immutable';
END;
$$;
CREATE TRIGGER provider_ui_command_retained BEFORE UPDATE OR DELETE ON "provider_ui_commands"
  FOR EACH ROW EXECUTE FUNCTION provider_ui_command_retained();
