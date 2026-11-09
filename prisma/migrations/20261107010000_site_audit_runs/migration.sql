CREATE TABLE "site_audit_runs" (
  "id" TEXT NOT NULL, "publicId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL, "target" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'queued',
  "stopReason" TEXT, "requestedPages" INTEGER NOT NULL, "budgetPages" INTEGER NOT NULL,
  "pagesCrawled" INTEGER NOT NULL DEFAULT 0, "requests" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0, "generation" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "workflowId" TEXT,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "lastHeartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_audit_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_audit_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_audit_runs_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "agent_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "site_audit_runs_publicId_key" ON "site_audit_runs"("publicId");
CREATE UNIQUE INDEX "site_audit_runs_reportId_key" ON "site_audit_runs"("reportId");
CREATE INDEX "site_audit_runs_state_createdAt_id_idx" ON "site_audit_runs"("state", "createdAt", "id");
CREATE INDEX "site_audit_runs_projectId_createdAt_id_idx" ON "site_audit_runs"("projectId", "createdAt", "id");

CREATE TABLE "site_audit_pages" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "urlHash" VARCHAR(64) NOT NULL, "ordinal" INTEGER NOT NULL,
  "facts" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_audit_pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_audit_pages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "site_audit_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "site_audit_pages_runId_urlHash_key" ON "site_audit_pages"("runId", "urlHash");
CREATE UNIQUE INDEX "site_audit_pages_runId_ordinal_key" ON "site_audit_pages"("runId", "ordinal");

CREATE TABLE "site_audit_frontier" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "urlHash" VARCHAR(64) NOT NULL,
  "url" TEXT NOT NULL, "depth" INTEGER NOT NULL, "state" TEXT NOT NULL DEFAULT 'queued',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_audit_frontier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_audit_frontier_runId_fkey" FOREIGN KEY ("runId") REFERENCES "site_audit_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "site_audit_frontier_runId_urlHash_key" ON "site_audit_frontier"("runId", "urlHash");
CREATE INDEX "site_audit_frontier_runId_state_depth_createdAt_id_idx" ON "site_audit_frontier"("runId", "state", "depth", "createdAt", "id");
