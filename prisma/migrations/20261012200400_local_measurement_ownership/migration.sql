-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Expand only: independent local execution reuses normalized observations and canonical Meter custody.
-- No provider registration, scheduling activation, paid I/O or legacy observation backfill.
CREATE TABLE "local_measurement_points" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "revisionKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL, "point" JSONB NOT NULL, "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("projectId", "revisionKey"), UNIQUE ("projectId", "id"),
  CONSTRAINT "local_points_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE,
  CONSTRAINT "local_points_actor_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "local_points_json_check" CHECK (jsonb_typeof("point")='object' AND octet_length("point"::text)<=16384),
  CONSTRAINT "local_points_hash_check" CHECK ("contentHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$')
);
CREATE TABLE "local_measurement_targets" (
  "id" TEXT PRIMARY KEY, "publicId" TEXT NOT NULL UNIQUE, "projectId" TEXT NOT NULL,
  "keywordId" TEXT NOT NULL, "pointId" TEXT NOT NULL, "targetKey" TEXT NOT NULL,
  "target" JSONB NOT NULL, "keywordSnapshot" JSONB NOT NULL, "keywordSourceHash" TEXT NOT NULL,
  "actorId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("projectId", "targetKey"), UNIQUE ("projectId", "id"),
  CONSTRAINT "local_targets_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE,
  CONSTRAINT "local_targets_keyword_fk" FOREIGN KEY ("projectId", "keywordId") REFERENCES "keywords" ("projectId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_targets_point_fk" FOREIGN KEY ("projectId", "pointId") REFERENCES "local_measurement_points" ("projectId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_targets_actor_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "local_targets_public_id_check" CHECK ("publicId" ~ '^lmt_[a-z][a-z0-9]{23}$'),
  CONSTRAINT "local_targets_hash_check" CHECK ("keywordSourceHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$'),
  CONSTRAINT "local_targets_json_check" CHECK (jsonb_typeof("target")='object' AND octet_length("target"::text)<=16384 AND jsonb_typeof("keywordSnapshot")='object' AND octet_length("keywordSnapshot"::text)<=16384)
);
CREATE TABLE "local_measurement_runs" (
  "id" TEXT PRIMARY KEY, "publicId" TEXT NOT NULL UNIQUE, "projectId" TEXT NOT NULL,
  "operation" TEXT NOT NULL, "keyHash" TEXT NOT NULL, "bodyHash" TEXT NOT NULL, "actorId" TEXT,
  "quote" JSONB NOT NULL, "quoteHash" TEXT NOT NULL, "expectedTargetKeys" TEXT[] NOT NULL,
  "source" TEXT NOT NULL, "trigger" TEXT NOT NULL, "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("projectId", "operation", "keyHash"), UNIQUE ("projectId", "id"),
  CONSTRAINT "local_runs_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE,
  CONSTRAINT "local_runs_actor_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "local_runs_public_id_check" CHECK ("publicId" ~ '^lmr_[a-z][a-z0-9]{23}$'),
  CONSTRAINT "local_runs_scope_check" CHECK ("operation"='local_scan_submit' AND "source" IN ('app','worker','api','cli','mcp','sdk') AND "trigger" IN ('manual','scheduled')),
  CONSTRAINT "local_runs_hash_check" CHECK ("keyHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$' AND "bodyHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$' AND "quoteHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$'),
  CONSTRAINT "local_runs_json_check" CHECK (jsonb_typeof("quote")='object' AND octet_length("quote"::text)<=262144),
  CONSTRAINT "local_runs_count_check" CHECK (cardinality("expectedTargetKeys") BETWEEN 1 AND 10000 AND array_position("expectedTargetKeys",NULL) IS NULL),
  CONSTRAINT "local_runs_version_check" CHECK ("version">=0)
);
CREATE UNIQUE INDEX "provider_connections_project_id_local_unique" ON "provider_connections" ("projectId", "id");
CREATE TABLE "local_measurement_run_items" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "runId" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL UNIQUE, "bodyHash" TEXT NOT NULL, "record" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0, "connectionId" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "credentialVersion" TEXT NOT NULL, "correlationId" TEXT NOT NULL, "namespace" TEXT NOT NULL,
  "preparedAttemptId" TEXT, "preparedLeaseId" TEXT, "requestHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("runId", "targetId"), UNIQUE ("projectId", "id"), UNIQUE ("projectId", "targetId", "id"),
  CONSTRAINT "local_items_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE,
  CONSTRAINT "local_items_run_fk" FOREIGN KEY ("projectId", "runId") REFERENCES "local_measurement_runs" ("projectId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_items_target_fk" FOREIGN KEY ("projectId", "targetId") REFERENCES "local_measurement_targets" ("projectId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_items_connection_fk" FOREIGN KEY ("projectId", "connectionId") REFERENCES "provider_connections" ("projectId", "id") ON DELETE RESTRICT,
  CONSTRAINT "local_items_json_check" CHECK (jsonb_typeof("record")='object' AND octet_length("record"::text)<=262144),
  CONSTRAINT "local_items_version_check" CHECK ("version">=0 AND CASE
    WHEN jsonb_typeof("record"->'version')='number' THEN ("record"->>'version')::numeric="version"
    ELSE FALSE END),
  CONSTRAINT "local_items_hash_check" CHECK ("bodyHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$' AND ("requestHash" IS NULL OR "requestHash" ~ '^([a-z][a-z0-9-]*:)?[a-f0-9]{64}$')),
  CONSTRAINT "local_items_prepared_check" CHECK (("preparedAttemptId" IS NULL)=("preparedLeaseId" IS NULL) AND ("preparedAttemptId" IS NULL)=("requestHash" IS NULL))
);
CREATE TABLE "local_measurement_target_owners" (
  "projectId" TEXT NOT NULL, "targetId" TEXT NOT NULL, "itemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0, "workerToken" TEXT, "workerExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("projectId", "targetId"),
  CONSTRAINT "local_owners_target_fk" FOREIGN KEY ("projectId", "targetId") REFERENCES "local_measurement_targets" ("projectId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_owners_item_fk" FOREIGN KEY ("projectId", "targetId", "itemId") REFERENCES "local_measurement_run_items" ("projectId", "targetId", "id") ON DELETE CASCADE,
  CONSTRAINT "local_owners_version_check" CHECK ("version">=0),
  CONSTRAINT "local_owners_worker_check" CHECK (("workerToken" IS NULL)=("workerExpiresAt" IS NULL))
);

ALTER TABLE "observation_runs" ALTER COLUMN "rankCheckId" DROP NOT NULL;
ALTER TABLE "observation_runs" ADD COLUMN "neutralExecutionItemId" TEXT;
CREATE UNIQUE INDEX "observation_runs_neutralExecutionItemId_key" ON "observation_runs" ("neutralExecutionItemId");
ALTER TABLE "observation_runs" ADD CONSTRAINT "observation_runs_exact_owner_check" CHECK (("rankCheckId" IS NOT NULL)::integer+("neutralExecutionItemId" IS NOT NULL)::integer=1);
ALTER TABLE "observation_runs" ADD CONSTRAINT "observation_runs_neutral_project_fk" FOREIGN KEY ("projectId", "neutralExecutionItemId") REFERENCES "local_measurement_run_items" ("projectId", "id") ON DELETE CASCADE;

-- Existing organic ownership has no RankCheck.projectId scalar. Prove it through its actual Keyword FK.
CREATE FUNCTION "check_observation_legacy_project"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW."rankCheckId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "rank_checks" c JOIN "keywords" k ON k."id"=c."keywordId"
    WHERE c."id"=NEW."rankCheckId" AND k."projectId"=NEW."projectId"
  ) THEN RAISE EXCEPTION 'Observation owner must belong to its project' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "observation_runs_legacy_project_guard" BEFORE INSERT OR UPDATE ON "observation_runs"
  FOR EACH ROW EXECUTE FUNCTION "check_observation_legacy_project"();

CREATE FUNCTION "guard_local_measurement_immutable"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL
    AND (to_jsonb(NEW)-'actorId')=(to_jsonb(OLD)-'actorId')
    AND pg_trigger_depth()>=2 AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id"=OLD."actorId") THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Local measurement revisions are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "local_points_immutable" BEFORE UPDATE ON "local_measurement_points" FOR EACH ROW EXECUTE FUNCTION "guard_local_measurement_immutable"();
CREATE TRIGGER "local_targets_immutable" BEFORE UPDATE ON "local_measurement_targets" FOR EACH ROW EXECUTE FUNCTION "guard_local_measurement_immutable"();

CREATE FUNCTION "guard_local_measurement_binding"() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE immutable_old JSONB; immutable_new JSONB;
BEGIN
  IF TG_TABLE_NAME='local_measurement_runs' THEN
    immutable_old=to_jsonb(OLD)-ARRAY['version','updatedAt','cancellationRequested','actorId'];
    immutable_new=to_jsonb(NEW)-ARRAY['version','updatedAt','cancellationRequested','actorId'];
    IF OLD."actorId" IS DISTINCT FROM NEW."actorId" AND NOT (
      OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL AND pg_trigger_depth()>=2
      AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id"=OLD."actorId")
    ) THEN RAISE EXCEPTION 'Local measurement actor is immutable' USING ERRCODE='23514'; END IF;
    IF OLD."cancellationRequested" AND NOT NEW."cancellationRequested" THEN RAISE EXCEPTION 'Cancellation cannot be reversed' USING ERRCODE='23514'; END IF;
  ELSE
    immutable_old=to_jsonb(OLD)-ARRAY['version','updatedAt','record'];
    immutable_new=to_jsonb(NEW)-ARRAY['version','updatedAt','record'];
  END IF;
  IF immutable_old IS DISTINCT FROM immutable_new THEN RAISE EXCEPTION 'Local measurement custody binding is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "local_runs_binding" BEFORE UPDATE ON "local_measurement_runs" FOR EACH ROW EXECUTE FUNCTION "guard_local_measurement_binding"();
CREATE TRIGGER "local_items_binding" BEFORE UPDATE ON "local_measurement_run_items" FOR EACH ROW EXECUTE FUNCTION "guard_local_measurement_binding"();
