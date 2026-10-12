-- after-data-migration: 20261011021000_accounting_history
-- data-migration-contract: self-guarding
BEGIN;
SET lock_timeout = '10s';
LOCK TABLE projects IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  imported_namespace text;
  project record;
  budget jsonb;
  provenance jsonb;
  scope_key text;
  cap_value numeric;
  next_version integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM data_migrations WHERE id='20261011021000_accounting_history' AND "finishedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Complete and verify accounting history before dropping the project cap';
  END IF;
  SELECT namespace INTO imported_namespace FROM metering_history_progress
    WHERE migration_id='20261011021000_accounting_history' AND verified_at IS NOT NULL;
  IF imported_namespace IS NULL THEN
    RAISE EXCEPTION 'Every project cap must be present in the verified Store namespace';
  END IF;
  LOCK TABLE metering_budget IN SHARE ROW EXCLUSIVE MODE;
  -- Old instances can create projects or edit caps after the history snapshot.
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('projects')
    AND attname='budgetCapCents' AND NOT attisdropped) THEN
    FOR project IN
      SELECT p.*, latest.version AS imported_version, s.payload AS snapshot
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT b.version FROM metering_budget b WHERE b.namespace=imported_namespace
          AND b.budget_id='project:' || p.id || ':monthly' ORDER BY b.version DESC LIMIT 1
      ) latest ON true
      LEFT JOIN metering_legacy_setting_source s ON s.kind='project' AND s.source_id=p.id
      WHERE latest.version IS NULL OR (latest.version=1 AND s.source_id IS NOT NULL
        AND p."budgetCapCents"::text IS DISTINCT FROM s.payload->>'budgetCapCents')
    LOOP
      next_version := COALESCE(project.imported_version,0)+1;
      cap_value := CASE WHEN COALESCE(project."budgetCapCents",5000)>0
        THEN COALESCE(project."budgetCapCents",5000)::numeric*10000 ELSE NULL END;
      scope_key := '{"group":' || to_json(project.id)::text || ',"kind":"group","namespace":'
        || to_json(imported_namespace)::text || '}';
      budget := jsonb_build_object(
        'id','project:' || project.id || ':monthly','version',next_version,
        'scope',scope_key::jsonb,'surface','any','unit','budget_cents',
        'limit',CASE WHEN cap_value IS NULL THEN NULL ELSE jsonb_build_object(
          'value',jsonb_build_object('$bigint',cap_value::text),'scale',4,'unit','budget_cents') END,
        'window',jsonb_build_object('kind','calendar_month','timezone','UTC'),'onExceed','block');
      provenance := jsonb_build_object('migrationId','20261011050000_drop_project_spending_cap',
        'namespace',imported_namespace,'budgetCapCents',project."budgetCapCents"::text,'budget',budget);
      IF project.imported_version IS NOT NULL THEN
        provenance := provenance || jsonb_build_object('importedBudgetVersion',project.imported_version,
          'snapshotBudgetCapCents',project.snapshot->'budgetCapCents');
      END IF;
      INSERT INTO metering_legacy_setting_source(kind,source_id,payload)
        VALUES('project_cap_drop',project.id,provenance) ON CONFLICT(kind,source_id) DO NOTHING;
      IF NOT EXISTS (SELECT 1 FROM metering_legacy_setting_source
        WHERE kind='project_cap_drop' AND source_id=project.id AND payload=provenance) THEN
        RAISE EXCEPTION 'Project cap backfill provenance conflicts';
      END IF;
      INSERT INTO metering_budget(namespace,budget_id,version,scope_kind,scope_key,surface,unit,
        limit_value,limit_scale,"window",on_exceed,body)
        VALUES(imported_namespace,budget->>'id',next_version,'group',scope_key,'any','budget_cents',
          cap_value,CASE WHEN cap_value IS NULL THEN NULL ELSE 4 END,budget->'window','block',budget)
        ON CONFLICT(namespace,budget_id,version) DO NOTHING;
    END LOOP;
  END IF;
  IF EXISTS (
    SELECT 1 FROM projects p WHERE NOT EXISTS (
      SELECT 1 FROM metering_budget b WHERE b.namespace=imported_namespace
        AND b.budget_id='project:' || p.id || ':monthly'
        AND b.scope_kind='group' AND b.scope_key::jsonb=jsonb_build_object(
          'kind','group','namespace',imported_namespace,'group',p.id)
        AND b.surface='any' AND b.unit='budget_cents' AND b.on_exceed='block'
        AND b."window"=jsonb_build_object('kind','calendar_month','timezone','UTC')
        AND (b.limit_value IS NULL OR (b.limit_value>=0 AND b.limit_scale BETWEEN 0 AND 18))
        AND b.body @> jsonb_build_object('id',b.budget_id,'version',b.version,'scope',b.scope_key::jsonb,
          'surface',b.surface,'unit',b.unit,'window',b."window",'onExceed',b.on_exceed,
          'limit',CASE WHEN b.limit_value IS NULL THEN NULL ELSE jsonb_build_object(
            'value',jsonb_build_object('$bigint',b.limit_value::text),'scale',b.limit_scale,'unit',b.unit) END)
        AND NOT EXISTS (SELECT 1 FROM metering_budget newer WHERE newer.namespace=b.namespace
          AND newer.budget_id=b.budget_id AND newer.version>b.version)
    )
  ) THEN
    RAISE EXCEPTION 'Every project cap must be present in the verified Store namespace';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION provider_ui_project_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."ownerId", NEW."writeMode", NEW."isSample")
    IS DISTINCT FROM ROW(OLD."ownerId", OLD."writeMode", OLD."isSample") THEN
    NEW."providerUiRevision" := OLD."providerUiRevision" + 1;
  ELSE
    NEW."providerUiRevision" := GREATEST(OLD."providerUiRevision", NEW."providerUiRevision");
  END IF;
  RETURN NEW;
END;
$$;
ALTER TABLE projects DROP COLUMN IF EXISTS "budgetCapCents";
COMMIT;
