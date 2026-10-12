DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'provider_connections'
      AND column_name = 'costPerCheckCents'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM provider_connections
    WHERE "credentialSource"::text = 'own'
      AND "costPerCheckCents" IS NOT NULL
      AND ("costPerCheckCents" < 0 OR "costPerCheckCents"::text IN ('NaN','Infinity','-Infinity'))
  ) THEN
    RAISE EXCEPTION 'Invalid legacy provider rate; reconcile before retiring the column';
  END IF;

  -- The rate editor's existing row is authoritative when both representations exist.
  INSERT INTO provider_connection_rates
    (id, "connectionId", feature, "amountCents", "createdAt", "updatedAt")
  SELECT md5('provider-rate:rank_check:' || id), id, 'rank_check'::"ProviderCostFeature",
    "costPerCheckCents", "createdAt", "updatedAt"
  FROM provider_connections
  WHERE "credentialSource"::text = 'own' AND "costPerCheckCents" IS NOT NULL
  ON CONFLICT ("connectionId", feature) DO NOTHING;

  -- Keep UI revision fencing valid after the legacy column disappears.
  EXECUTE $function$
    CREATE OR REPLACE FUNCTION provider_ui_connection_revision() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF ROW(NEW."provider", NEW."status", NEW."priority", NEW."enabled", NEW."credentialsEncrypted",
        NEW."credentialSource", NEW."publicId", NEW."projectId")
        IS DISTINCT FROM ROW(OLD."provider", OLD."status", OLD."priority", OLD."enabled", OLD."credentialsEncrypted",
        OLD."credentialSource", OLD."publicId", OLD."projectId") THEN
        NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
      ELSE
        NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$;
  ALTER TABLE provider_connections DROP COLUMN "costPerCheckCents";
END $$;
