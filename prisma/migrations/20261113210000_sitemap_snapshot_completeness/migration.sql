-- Historical reads require a fresh traversal before proving absence.
ALTER TABLE "sitemap_snapshots" ADD COLUMN "complete" BOOLEAN NOT NULL DEFAULT false;
