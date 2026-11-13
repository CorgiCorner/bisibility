-- Additive only. Check-ins (visit, start or manual mark) are kept apart from
-- verified project work days, so "Days with work" in reports stays truthful.
CREATE TABLE "project_seo_challenge_check_ins" (
  "challengeId" TEXT NOT NULL REFERENCES "project_seo_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "localDay" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("challengeId", "localDay")
);
