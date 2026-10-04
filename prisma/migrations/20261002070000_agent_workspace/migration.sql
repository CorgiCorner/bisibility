ALTER TYPE "ProviderCostFeature" ADD VALUE 'ai_visibility';
ALTER TYPE "ProviderCostFeature" ADD VALUE 'prompt_explorer';
CREATE TABLE "project_contexts" (
    "projectId" TEXT NOT NULL,
    "business" VARCHAR(4000) NOT NULL DEFAULT '',
    "audience" VARCHAR(4000) NOT NULL DEFAULT '',
    "products" VARCHAR(4000) NOT NULL DEFAULT '',
    "goals" VARCHAR(4000) NOT NULL DEFAULT '',
    "agentRules" VARCHAR(4000) NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_contexts_pkey" PRIMARY KEY ("projectId")
);
CREATE TABLE "agent_reports" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_reports_public_id_contract_format" CHECK ("publicId" ~ '^agr_[a-z][a-z0-9]{23}$'),
    CONSTRAINT "agent_reports_body_size" CHECK (octet_length("body"::text) <= 524288),
    CONSTRAINT "agent_reports_provenance_size" CHECK (octet_length("provenance"::text) <= 65536)
);
CREATE UNIQUE INDEX "agent_reports_publicId_key" ON "agent_reports"("publicId");
CREATE INDEX "agent_reports_projectId_createdAt_id_idx" ON "agent_reports"("projectId", "createdAt", "id");
CREATE INDEX "agent_reports_projectId_kind_createdAt_id_idx" ON "agent_reports"("projectId", "kind", "createdAt", "id");
ALTER TABLE "project_contexts" ADD CONSTRAINT "project_contexts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
