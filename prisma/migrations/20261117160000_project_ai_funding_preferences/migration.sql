SET lock_timeout = '5s';
CREATE TABLE "project_ai_funding_preferences" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_ai_funding_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_ai_funding_preferences_mode_check" CHECK ("mode" IN ('byok', 'credits')),
  CONSTRAINT "project_ai_funding_preferences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_ai_funding_preferences_projectId_provider_key"
  ON "project_ai_funding_preferences"("projectId", "provider");
-- Only the owner's preference becomes shared. Keep the legacy table for rollout compatibility.
INSERT INTO "project_ai_funding_preferences" ("id", "projectId", "provider", "mode", "createdAt", "updatedAt")
SELECT f."id", f."projectId", f."provider", f."mode", f."createdAt", f."updatedAt"
FROM "assistant_funding_preferences" f JOIN "projects" p ON p."id" = f."projectId" AND p."ownerId" = f."userId"
WHERE f."mode" IN ('byok', 'credits');
RESET lock_timeout;
