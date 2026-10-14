-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Expand only. Existing project views keep their authors, JSON and visibility.
CREATE TYPE "SavedViewVisibility" AS ENUM ('private', 'project');

ALTER TABLE "saved_views"
  ADD COLUMN "visibility" "SavedViewVisibility" NOT NULL DEFAULT 'project',
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "saved_views_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "saved_views_private_owner_check" CHECK (
    ("visibility" = 'private' AND "ownerId" IS NOT NULL) OR
    ("visibility" = 'project' AND "ownerId" IS NULL)
  ),
  ADD CONSTRAINT "saved_views_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "saved_views_projectId_surface_visibility_ownerId_idx"
  ON "saved_views"("projectId", "surface", "visibility", "ownerId");

CREATE TABLE "user_project_surface_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "defaultSavedViewId" TEXT,
  "defaultSavedViewPublicId" TEXT,
  "defaultPresetId" TEXT NOT NULL DEFAULT 'general',
  "presentation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_project_surface_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_project_surface_preferences_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "user_project_surface_preferences_schemaVersion_check" CHECK ("schemaVersion" > 0),
  CONSTRAINT "user_project_surface_preferences_surface_check"
    CHECK ("surface" IN ('keywords', 'competitors', 'dashboard')),
  CONSTRAINT "user_project_surface_preferences_dashboard_default_check"
    CHECK ("surface" <> 'dashboard' OR "defaultSavedViewId" IS NULL),
  CONSTRAINT "user_project_surface_preferences_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_project_surface_preferences_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_project_surface_preferences_defaultSavedViewId_fkey"
    FOREIGN KEY ("defaultSavedViewId") REFERENCES "saved_views"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_project_surface_preferences_userId_projectId_surface_key"
  ON "user_project_surface_preferences"("userId", "projectId", "surface");
CREATE INDEX "user_project_surface_preferences_projectId_idx"
  ON "user_project_surface_preferences"("projectId");
CREATE INDEX "user_project_surface_preferences_defaultSavedViewId_idx"
  ON "user_project_surface_preferences"("defaultSavedViewId");

-- A deleted view leaves a tombstone so a retried create cannot recreate it.
CREATE TABLE "saved_view_creation_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "savedViewPublicId" TEXT NOT NULL,
  "savedViewId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_view_creation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_view_creation_requests_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_view_creation_requests_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_view_creation_requests_savedViewId_fkey" FOREIGN KEY ("savedViewId")
    REFERENCES "saved_views"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "saved_view_creation_requests_userId_projectId_requestId_key"
  ON "saved_view_creation_requests"("userId", "projectId", "requestId");
CREATE INDEX "saved_view_creation_requests_projectId_idx"
  ON "saved_view_creation_requests"("projectId");
CREATE INDEX "saved_view_creation_requests_savedViewId_idx"
  ON "saved_view_creation_requests"("savedViewId");
