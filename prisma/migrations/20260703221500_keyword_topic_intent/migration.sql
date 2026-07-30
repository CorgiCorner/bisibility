ALTER TABLE "keywords"
  ADD COLUMN "topic" TEXT,
  ADD COLUMN "intent" TEXT;

CREATE INDEX "keywords_projectId_topic_idx" ON "keywords"("projectId", "topic");
