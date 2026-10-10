CREATE TYPE "AiPromptCategory" AS ENUM ('neutral', 'branded', 'comparative');
CREATE TYPE "AiTrackingSource" AS ENUM ('consumer_scrape', 'model_api', 'google_aio');
CREATE TYPE "AiTrackingEngine" AS ENUM ('chat_gpt', 'gemini', 'claude', 'perplexity', 'google');
CREATE TYPE "AiTrackingDispatch" AS ENUM ('planned', 'claimed', 'submission_started', 'submitted', 'collecting', 'submission_unknown', 'terminal');
CREATE TYPE "AiTrackingMeasurement" AS ENUM ('answer_present', 'aio_not_present', 'partial', 'unavailable', 'failed', 'unknown');
CREATE TYPE "AiTrackingRunState" AS ENUM ('planned', 'running', 'completed', 'partial', 'blocked', 'failed', 'cancelled', 'skipped');
CREATE TYPE "AiTrackingSuggestionGenerationState" AS ENUM ('planned', 'claimed', 'submission_started', 'submission_unknown', 'completed', 'failed', 'cancelled');
ALTER TYPE "ProviderCostFeature" ADD VALUE 'ai_tracking';
CREATE TABLE "ai_topics" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pausedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_topics_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_prompts" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topicId" TEXT,
    "label" TEXT,
    "pausedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_prompt_revisions" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "category" "AiPromptCategory" NOT NULL DEFAULT 'neutral',
    "text" TEXT NOT NULL,
    "textHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationId" TEXT,
    "generationDraftId" TEXT,
    "provenance" JSONB,
    CONSTRAINT "ai_prompt_revisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_schedules" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_tracking_schedules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_runs" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "plannedAt" TIMESTAMP(3),
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "launchPayload" JSONB NOT NULL,
    "competitorSnapshot" JSONB NOT NULL,
    "state" "AiTrackingRunState" NOT NULL DEFAULT 'planned',
    "retryOfRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ai_tracking_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_samples" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promptRevisionId" TEXT NOT NULL,
    "source" "AiTrackingSource" NOT NULL,
    "engine" "AiTrackingEngine" NOT NULL,
    "configurationHash" VARCHAR(64) NOT NULL,
    "replicateOrdinal" INTEGER NOT NULL DEFAULT 0,
    "plan" JSONB NOT NULL,
    "attemptId" TEXT NOT NULL,
    "dispatch" "AiTrackingDispatch" NOT NULL DEFAULT 'planned',
    "measurement" "AiTrackingMeasurement" NOT NULL DEFAULT 'unknown',
    "providerTaskId" TEXT,
    "nextPollAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "raw" JSONB,
    "answerText" TEXT,
    "providerCostEntryId" TEXT,
    "receipt" JSONB,
    "resultHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ai_tracking_samples_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_citations" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "ai_tracking_citations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_entity_observations" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "competitorId" TEXT,
    "snippet" TEXT,
    "matchPolicy" TEXT NOT NULL DEFAULT 'exact_alias',
    "confidence" DOUBLE PRECISION,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentioned" BOOLEAN NOT NULL,
    "position" INTEGER,
    CONSTRAINT "ai_tracking_entity_observations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_tracking_suggestion_generations" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorCredential" JSONB,
    "entrySource" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "preview" JSONB NOT NULL,
    "credentialConnectionId" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "actualModel" TEXT,
    "attemptId" TEXT NOT NULL,
    "state" "AiTrackingSuggestionGenerationState" NOT NULL DEFAULT 'planned',
    "usageTag" TEXT,
    "providerCostEntryId" TEXT,
    "receipt" JSONB,
    "evidence" JSONB,
    "result" JSONB,
    "resultHash" VARCHAR(64),
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_tracking_suggestion_generations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_topics_publicId_key" ON "ai_topics"("publicId");
CREATE INDEX "ai_topics_projectId_archivedAt_pausedAt_idx" ON "ai_topics"("projectId", "archivedAt", "pausedAt");
CREATE UNIQUE INDEX "ai_topics_projectId_id_key" ON "ai_topics"("projectId", "id");
CREATE UNIQUE INDEX "ai_prompts_publicId_key" ON "ai_prompts"("publicId");
CREATE INDEX "ai_prompts_projectId_archivedAt_pausedAt_idx" ON "ai_prompts"("projectId", "archivedAt", "pausedAt");
CREATE UNIQUE INDEX "ai_prompts_projectId_id_key" ON "ai_prompts"("projectId", "id");
CREATE UNIQUE INDEX "ai_prompt_revisions_publicId_key" ON "ai_prompt_revisions"("publicId");
CREATE UNIQUE INDEX "ai_prompt_revisions_projectId_id_key" ON "ai_prompt_revisions"("projectId", "id");
CREATE UNIQUE INDEX "ai_prompt_revisions_promptId_ordinal_key" ON "ai_prompt_revisions"("promptId", "ordinal");
CREATE UNIQUE INDEX "ai_tracking_schedules_publicId_key" ON "ai_tracking_schedules"("publicId");
CREATE INDEX "ai_tracking_schedules_enabled_nextRunAt_id_idx" ON "ai_tracking_schedules"("enabled", "nextRunAt", "id");
CREATE UNIQUE INDEX "ai_tracking_schedules_projectId_id_key" ON "ai_tracking_schedules"("projectId", "id");
CREATE UNIQUE INDEX "ai_tracking_runs_publicId_key" ON "ai_tracking_runs"("publicId");
CREATE INDEX "ai_tracking_runs_projectId_createdAt_id_idx" ON "ai_tracking_runs"("projectId", "createdAt", "id");
CREATE UNIQUE INDEX "ai_tracking_runs_projectId_id_key" ON "ai_tracking_runs"("projectId", "id");
CREATE UNIQUE INDEX "ai_tracking_runs_projectId_idempotencyKey_key" ON "ai_tracking_runs"("projectId", "idempotencyKey");
CREATE UNIQUE INDEX "ai_tracking_runs_scheduleId_plannedAt_key" ON "ai_tracking_runs"("scheduleId", "plannedAt");
CREATE UNIQUE INDEX "ai_tracking_samples_publicId_key" ON "ai_tracking_samples"("publicId");
CREATE INDEX "ai_tracking_samples_projectId_runId_createdAt_id_idx" ON "ai_tracking_samples"("projectId", "runId", "createdAt", "id");
CREATE INDEX "ai_tracking_samples_dispatch_updatedAt_id_idx" ON "ai_tracking_samples"("dispatch", "updatedAt", "id");
CREATE INDEX "ai_tracking_samples_dispatch_nextPollAt_id_idx" ON "ai_tracking_samples"("dispatch", "nextPollAt", "id");
CREATE UNIQUE INDEX "ai_tracking_samples_projectId_id_key" ON "ai_tracking_samples"("projectId", "id");
CREATE UNIQUE INDEX "ai_tracking_sample_identity_key" ON "ai_tracking_samples"("runId", "promptRevisionId", "configurationHash", "replicateOrdinal");
CREATE UNIQUE INDEX "ai_tracking_citations_sampleId_position_key" ON "ai_tracking_citations"("sampleId", "position");
CREATE UNIQUE INDEX "ai_tracking_entity_observations_sampleId_entityKey_key" ON "ai_tracking_entity_observations"("sampleId", "entityKey");
CREATE UNIQUE INDEX "ai_tracking_suggestion_generations_publicId_key" ON "ai_tracking_suggestion_generations"("publicId");
CREATE UNIQUE INDEX "ai_tracking_suggestion_generations_attemptId_key" ON "ai_tracking_suggestion_generations"("attemptId");
CREATE INDEX "ai_tracking_suggestion_generations_projectId_createdAt_id_idx" ON "ai_tracking_suggestion_generations"("projectId", "createdAt", "id");
CREATE INDEX "ai_tracking_suggestion_generations_state_updatedAt_id_idx" ON "ai_tracking_suggestion_generations"("state", "updatedAt", "id");
CREATE UNIQUE INDEX "ai_tracking_suggestion_generations_projectId_id_key" ON "ai_tracking_suggestion_generations"("projectId", "id");
CREATE UNIQUE INDEX "ai_tracking_suggestion_generations_projectId_idempotencyKey_key" ON "ai_tracking_suggestion_generations"("projectId", "idempotencyKey");
CREATE UNIQUE INDEX "provider_cost_entries_projectId_id_key" ON "provider_cost_entries"("projectId", "id");
ALTER TABLE "ai_topics" ADD CONSTRAINT "ai_topics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_projectId_topicId_fkey" FOREIGN KEY ("projectId", "topicId") REFERENCES "ai_topics"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_projectId_promptId_fkey" FOREIGN KEY ("projectId", "promptId") REFERENCES "ai_prompts"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_projectId_generationId_fkey" FOREIGN KEY ("projectId", "generationId") REFERENCES "ai_tracking_suggestion_generations"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_schedules" ADD CONSTRAINT "ai_tracking_schedules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_runs" ADD CONSTRAINT "ai_tracking_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_runs" ADD CONSTRAINT "ai_tracking_runs_projectId_scheduleId_fkey" FOREIGN KEY ("projectId", "scheduleId") REFERENCES "ai_tracking_schedules"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_samples" ADD CONSTRAINT "ai_tracking_samples_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_samples" ADD CONSTRAINT "ai_tracking_samples_projectId_runId_fkey" FOREIGN KEY ("projectId", "runId") REFERENCES "ai_tracking_runs"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_samples" ADD CONSTRAINT "ai_tracking_samples_projectId_promptRevisionId_fkey" FOREIGN KEY ("projectId", "promptRevisionId") REFERENCES "ai_prompt_revisions"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_samples" ADD CONSTRAINT "ai_tracking_samples_projectId_providerCostEntryId_fkey" FOREIGN KEY ("projectId", "providerCostEntryId") REFERENCES "provider_cost_entries"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_citations" ADD CONSTRAINT "ai_tracking_citations_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "ai_tracking_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_entity_observations" ADD CONSTRAINT "ai_tracking_entity_observations_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "ai_tracking_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_suggestion_generations" ADD CONSTRAINT "ai_tracking_suggestion_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tracking_suggestion_generations" ADD CONSTRAINT "ai_tracking_suggestion_generations_projectId_providerCostE_fkey" FOREIGN KEY ("projectId", "providerCostEntryId") REFERENCES "provider_cost_entries"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_topics" ADD CONSTRAINT "ai_topics_public_id_contract_format" CHECK ("publicId" ~ '^ait_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_public_id_contract_format" CHECK ("publicId" ~ '^aip_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_public_id_contract_format" CHECK ("publicId" ~ '^apr_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_tracking_schedules" ADD CONSTRAINT "ai_tracking_schedules_public_id_contract_format" CHECK ("publicId" ~ '^ais_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_tracking_runs" ADD CONSTRAINT "ai_tracking_runs_public_id_contract_format" CHECK ("publicId" ~ '^air_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_tracking_samples" ADD CONSTRAINT "ai_tracking_samples_public_id_contract_format" CHECK ("publicId" ~ '^asm_[a-z][a-z0-9]{23}$');


CREATE FUNCTION ai_tracking_guard_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'ai_prompt_revisions' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'AI prompt revisions are immutable';
    END IF;
  ELSIF (OLD.dispatch <> 'planned' OR NEW.dispatch <> 'planned') AND
    ROW(NEW.plan, NEW."attemptId", NEW."projectId", NEW."runId", NEW."promptRevisionId", NEW."configurationHash", NEW.source, NEW.engine, NEW."replicateOrdinal") IS DISTINCT FROM
    ROW(OLD.plan, OLD."attemptId", OLD."projectId", OLD."runId", OLD."promptRevisionId", OLD."configurationHash", OLD.source, OLD.engine, OLD."replicateOrdinal") THEN
    RAISE EXCEPTION 'Claimed AI tracking sample plans are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ai_prompt_revision_immutable BEFORE UPDATE ON "ai_prompt_revisions"
  FOR EACH ROW EXECUTE FUNCTION ai_tracking_guard_immutable();
CREATE TRIGGER ai_tracking_sample_plan_immutable BEFORE UPDATE ON "ai_tracking_samples"
  FOR EACH ROW EXECUTE FUNCTION ai_tracking_guard_immutable();


ALTER TABLE "ai_tracking_suggestion_generations" ADD CONSTRAINT "ai_tracking_suggestion_generations_public_id_contract_format" CHECK ("publicId" ~ '^asg_[a-z][a-z0-9]{23}$');
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revision_generation_reference_pair" CHECK (("generationId" IS NULL) = ("generationDraftId" IS NULL));
ALTER TABLE "ai_tracking_suggestion_generations" ADD CONSTRAINT "ai_generation_identity_bounds" CHECK ("requestHash" ~ '^[a-f0-9]{64}$' AND length("actorId") > 0 AND length("idempotencyKey") BETWEEN 1 AND 200 AND "entrySource" IN ('app','api','mcp','worker','cli','sdk'));
ALTER TABLE "ai_tracking_suggestion_generations" ADD CONSTRAINT "ai_generation_completed_evidence" CHECK (state <> 'completed' OR (result IS NOT NULL AND evidence IS NOT NULL AND "usageTag" IS NOT NULL AND "providerCostEntryId" IS NOT NULL AND "resultHash" IS NOT NULL));
CREATE FUNCTION ai_generation_guard_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW."publicId", NEW."projectId", NEW."actorId", NEW."actorCredential", NEW."entrySource", NEW."idempotencyKey", NEW."requestHash", NEW.preview, NEW."credentialConnectionId", NEW."requestedModel", NEW."attemptId", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD.id, OLD."publicId", OLD."projectId", OLD."actorId", OLD."actorCredential", OLD."entrySource", OLD."idempotencyKey", OLD."requestHash", OLD.preview, OLD."credentialConnectionId", OLD."requestedModel", OLD."attemptId", OLD."createdAt") THEN
    RAISE EXCEPTION 'Suggestion generation review and identity are immutable';
  END IF;
  IF OLD.state IN ('completed','failed','cancelled') AND ROW(NEW.state, NEW.result, NEW.evidence, NEW."resultHash", NEW."actualModel", NEW."usageTag", NEW."finishedAt") IS DISTINCT FROM ROW(OLD.state, OLD.result, OLD.evidence, OLD."resultHash", OLD."actualModel", OLD."usageTag", OLD."finishedAt") THEN
    RAISE EXCEPTION 'Suggestion generation terminal result is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ai_generation_identity_immutable BEFORE UPDATE ON "ai_tracking_suggestion_generations" FOR EACH ROW EXECUTE FUNCTION ai_generation_guard_immutable();
