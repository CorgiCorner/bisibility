ALTER TABLE "gsc_property_registry" ADD COLUMN "permissionLevel" TEXT;
CREATE TABLE "project_domain_verifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "domain" TEXT NOT NULL,
  "method" TEXT NOT NULL CHECK ("method" IN ('dns_txt', 'search_console')),
  "token" TEXT NOT NULL UNIQUE,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "lastCheckResult" TEXT,
  "proofScope" TEXT,
  "failures" INTEGER NOT NULL DEFAULT 0 CHECK ("failures" >= 0),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMP(3),
  "noticeSentAt" TIMESTAMP(3),
  "nextCheckAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "project_domain_verifications_projectId_domain_key" ON "project_domain_verifications"("projectId", "domain");
CREATE INDEX "project_domain_verifications_nextCheckAt_idx" ON "project_domain_verifications"("nextCheckAt");
