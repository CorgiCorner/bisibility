-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Additive private project identity and matching history. No historical metadata backfill.

CREATE TABLE "business_locations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicId" TEXT NOT NULL UNIQUE,
  "projectId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 0,
  "currentRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "business_locations_scope_0" ON "business_locations" ("projectId", "id");

CREATE TABLE "business_identity_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousRevisionId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "normalizerVersion" TEXT NOT NULL,
  "actorId" TEXT,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL
);

CREATE UNIQUE INDEX "business_identity_revisions_scope_0" ON "business_identity_revisions" ("projectId", "entityId", "id");

CREATE UNIQUE INDEX "business_identity_revisions_scope_1" ON "business_identity_revisions" ("entityId", "revision");

CREATE UNIQUE INDEX "business_identity_revisions_scope_2" ON "business_identity_revisions" ("projectId", "id");

CREATE TABLE "business_identifier_claims" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "identityRevisionId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "engine" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT NOT NULL
);

CREATE UNIQUE INDEX "business_identifier_claims_scope_0" ON "business_identifier_claims" ("projectId", "namespace", "engine", "type", "value");

CREATE INDEX "business_identifier_claims_lookup_0" ON "business_identifier_claims" ("projectId", "entityId");

CREATE TABLE "business_match_heads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "observationRunId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "currentDecisionId" TEXT
);

CREATE UNIQUE INDEX "business_match_heads_scope_0" ON "business_match_heads" ("projectId", "entityId", "itemId");

CREATE UNIQUE INDEX "business_match_heads_scope_1" ON "business_match_heads" ("projectId", "entityId", "observationRunId", "itemId", "id");

CREATE TABLE "business_match_decisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "headId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "identityRevisionId" TEXT NOT NULL,
  "observationRunId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "decisionRevision" INTEGER NOT NULL,
  "previousDecisionId" TEXT,
  "status" TEXT NOT NULL,
  "matchedBy" TEXT,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "confirmedBy" TEXT,
  "reviewReason" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "matcherVersion" TEXT NOT NULL,
  "evidence" JSONB NOT NULL
);

CREATE UNIQUE INDEX "business_match_decisions_scope_0" ON "business_match_decisions" ("headId", "decisionRevision");

CREATE UNIQUE INDEX "business_match_decisions_scope_1" ON "business_match_decisions" ("projectId", "entityId", "observationRunId", "itemId", "headId", "id");

CREATE TABLE "business_assignment_heads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "keywordId" TEXT,
  "marketId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "currentRevisionId" TEXT
);

CREATE UNIQUE INDEX "business_assignment_heads_scope_0" ON "business_assignment_heads" ("projectId", "scopeType", "scopeId");

CREATE UNIQUE INDEX "business_assignment_heads_scope_1" ON "business_assignment_heads" ("projectId", "id");

CREATE TABLE "business_assignment_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "headId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousRevisionId" TEXT,
  "entityId" TEXT,
  "identityRevisionId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT,
  "reason" TEXT NOT NULL
);

CREATE UNIQUE INDEX "business_assignment_revisions_scope_0" ON "business_assignment_revisions" ("headId", "revision");

CREATE UNIQUE INDEX "business_assignment_revisions_scope_1" ON "business_assignment_revisions" ("projectId", "headId", "id");

CREATE TABLE "business_location_mutations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "actorId" TEXT,
  "bodyHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "business_location_mutations_scope_0" ON "business_location_mutations" ("projectId", "operation", "keyHash");

CREATE UNIQUE INDEX "observation_runs_scope_business_key" ON "observation_runs" ("projectId", "id");

CREATE UNIQUE INDEX "keywords_scope_business_key" ON "keywords" ("projectId", "id");

CREATE UNIQUE INDEX "project_markets_scope_business_key" ON "project_markets" ("projectId", "id");

CREATE UNIQUE INDEX "observation_items_scope_business_key" ON "observation_items" ("id", "observationRunId");

ALTER TABLE "business_locations" ADD CONSTRAINT "business_locations_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_identity_revisions" ADD CONSTRAINT "business_identity_revisions_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_identity_revisions" ADD CONSTRAINT "business_identity_revisions_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_identifier_claims" ADD CONSTRAINT "business_identifier_claims_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_match_heads_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_match_decisions_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_match_decisions_confirmedBy_fk" FOREIGN KEY ("confirmedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_assignment_heads" ADD CONSTRAINT "business_assignment_heads_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_revisions_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_revisions_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_location_mutations" ADD CONSTRAINT "business_location_mutations_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_location_mutations" ADD CONSTRAINT "business_location_mutations_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_identity_revisions" ADD CONSTRAINT "business_identity_entity_fk" FOREIGN KEY ("projectId", "entityId") REFERENCES "business_locations" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_identity_revisions" ADD CONSTRAINT "business_identity_previous_fk" FOREIGN KEY ("projectId", "entityId", "previousRevisionId") REFERENCES "business_identity_revisions" ("projectId", "entityId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_locations" ADD CONSTRAINT "business_location_current_fk" FOREIGN KEY ("projectId", "id", "currentRevisionId") REFERENCES "business_identity_revisions" ("projectId", "entityId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_identifier_claims" ADD CONSTRAINT "business_claim_identity_fk" FOREIGN KEY ("projectId", "entityId", "identityRevisionId") REFERENCES "business_identity_revisions" ("projectId", "entityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_head_entity_fk" FOREIGN KEY ("projectId", "entityId") REFERENCES "business_locations" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_head_run_fk" FOREIGN KEY ("projectId", "observationRunId") REFERENCES "observation_runs" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_head_item_fk" FOREIGN KEY ("itemId", "observationRunId") REFERENCES "observation_items" ("id", "observationRunId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_decision_identity_fk" FOREIGN KEY ("projectId", "entityId", "identityRevisionId") REFERENCES "business_identity_revisions" ("projectId", "entityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_decision_head_fk" FOREIGN KEY ("projectId", "entityId", "observationRunId", "itemId", "headId") REFERENCES "business_match_heads" ("projectId", "entityId", "observationRunId", "itemId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_decision_previous_fk" FOREIGN KEY ("projectId", "entityId", "observationRunId", "itemId", "headId", "previousDecisionId") REFERENCES "business_match_decisions" ("projectId", "entityId", "observationRunId", "itemId", "headId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_match_current_fk" FOREIGN KEY ("projectId", "entityId", "observationRunId", "itemId", "id", "currentDecisionId") REFERENCES "business_match_decisions" ("projectId", "entityId", "observationRunId", "itemId", "headId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_assignment_heads" ADD CONSTRAINT "business_assignment_keyword_fk" FOREIGN KEY ("projectId", "keywordId") REFERENCES "keywords" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_assignment_heads" ADD CONSTRAINT "business_assignment_market_fk" FOREIGN KEY ("projectId", "marketId") REFERENCES "project_markets" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_head_fk" FOREIGN KEY ("projectId", "headId") REFERENCES "business_assignment_heads" ("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_identity_fk" FOREIGN KEY ("projectId", "entityId", "identityRevisionId") REFERENCES "business_identity_revisions" ("projectId", "entityId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_previous_fk" FOREIGN KEY ("projectId", "headId", "previousRevisionId") REFERENCES "business_assignment_revisions" ("projectId", "headId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_assignment_heads" ADD CONSTRAINT "business_assignment_current_fk" FOREIGN KEY ("projectId", "id", "currentRevisionId") REFERENCES "business_assignment_revisions" ("projectId", "headId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "business_locations" ADD CONSTRAINT "business_locations_valid" CHECK ("role" IN ('subject','competitor') AND "state" IN ('active','archived') AND "version">=0 AND (("version"=0 AND "currentRevisionId" IS NULL) OR ("version">0 AND "currentRevisionId" IS NOT NULL)));

ALTER TABLE "business_identity_revisions" ADD CONSTRAINT "business_identity_revisions_valid" CHECK ("revision">0 AND octet_length("snapshot"::text)<=524288 AND char_length("reason") BETWEEN 1 AND 500);

ALTER TABLE "business_match_heads" ADD CONSTRAINT "business_match_heads_valid" CHECK ("version">=0);

ALTER TABLE "business_match_decisions" ADD CONSTRAINT "business_match_decisions_valid" CHECK ("decisionRevision">0 AND "status" IN ('confirmed','candidate','rejected','unresolved') AND octet_length("evidence"::text)<=524288 AND ("reviewReason" IS NULL OR char_length("reviewReason")<=500));

ALTER TABLE "business_assignment_heads" ADD CONSTRAINT "business_assignment_heads_valid" CHECK ("version">=0 AND (("scopeType"='keyword' AND "keywordId" IS NOT NULL AND "marketId" IS NULL AND "scopeId"="keywordId") OR ("scopeType"='market' AND "marketId" IS NOT NULL AND "keywordId" IS NULL AND "scopeId"="marketId")));

ALTER TABLE "business_assignment_revisions" ADD CONSTRAINT "business_assignment_revisions_valid" CHECK ("revision">0 AND (("entityId" IS NULL)=("identityRevisionId" IS NULL)));

ALTER TABLE "business_location_mutations" ADD CONSTRAINT "business_location_mutations_valid" CHECK ("keyHash" ~ '^[a-f0-9]{64}$' AND "bodyHash" ~ '^[a-f0-9]{64}$' AND octet_length("result"::text)<=16384);

CREATE FUNCTION business_history_update_guard() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF (to_jsonb(NEW)-'actorId'-'confirmedBy') IS DISTINCT FROM (to_jsonb(OLD)-'actorId'-'confirmedBy')
    OR ((to_jsonb(NEW)->'actorId') IS DISTINCT FROM (to_jsonb(OLD)->'actorId') AND (to_jsonb(NEW)->'actorId') IS DISTINCT FROM 'null'::jsonb)
    OR ((to_jsonb(NEW)->'confirmedBy') IS DISTINCT FROM (to_jsonb(OLD)->'confirmedBy') AND (to_jsonb(NEW)->'confirmedBy') IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'Business measurement history is append-only' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)->'actorId') IS DISTINCT FROM (to_jsonb(OLD)->'actorId') AND
    (pg_trigger_depth()<2 OR EXISTS(SELECT 1 FROM users WHERE id=to_jsonb(OLD)->>'actorId'))
  THEN RAISE EXCEPTION 'Attribution may be cleared only by account deletion' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)->'confirmedBy') IS DISTINCT FROM (to_jsonb(OLD)->'confirmedBy') AND
    (pg_trigger_depth()<2 OR EXISTS(SELECT 1 FROM users WHERE id=to_jsonb(OLD)->>'confirmedBy'))
  THEN RAISE EXCEPTION 'Confirmation attribution may be cleared only by account deletion' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "business_identity_revisions_immutable" BEFORE UPDATE ON "business_identity_revisions" FOR EACH ROW EXECUTE FUNCTION business_history_update_guard();

CREATE TRIGGER "business_match_decisions_immutable" BEFORE UPDATE ON "business_match_decisions" FOR EACH ROW EXECUTE FUNCTION business_history_update_guard();

CREATE TRIGGER "business_assignment_revisions_immutable" BEFORE UPDATE ON "business_assignment_revisions" FOR EACH ROW EXECUTE FUNCTION business_history_update_guard();
