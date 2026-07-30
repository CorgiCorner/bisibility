ALTER TABLE "saved_views" ADD COLUMN "surface" TEXT NOT NULL DEFAULT 'keywords';

DROP INDEX "saved_views_projectId_idx";
CREATE INDEX "saved_views_projectId_surface_idx" ON "saved_views"("projectId", "surface");
