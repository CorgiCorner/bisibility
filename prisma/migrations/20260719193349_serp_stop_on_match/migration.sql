-- Stop SERP crawling after the tracked domain is found unless a project opts out.
ALTER TABLE "project_defaults"
ADD COLUMN "serpStopOnMatch" BOOLEAN NOT NULL DEFAULT true;
