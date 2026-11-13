CREATE TABLE "project_seo_challenges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "snapshotId" TEXT NOT NULL REFERENCES "page_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "joinedOn" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timeZone" TEXT NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "baselineClicks" INTEGER,
  "cardDownloadedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX "project_seo_challenges_userId_projectId_key"
  ON "project_seo_challenges"("userId", "projectId");
CREATE INDEX "project_seo_challenges_projectId_idx" ON "project_seo_challenges"("projectId");
CREATE INDEX "project_seo_challenges_snapshotId_idx" ON "project_seo_challenges"("snapshotId");

CREATE TABLE "project_seo_challenge_days" (
  "challengeId" TEXT NOT NULL REFERENCES "project_seo_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "localDay" TEXT NOT NULL,
  PRIMARY KEY ("challengeId", "localDay")
);
