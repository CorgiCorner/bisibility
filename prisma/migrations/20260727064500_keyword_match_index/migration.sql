-- Supports exact, case-insensitive keyword matching after trimming.
-- CREATE INDEX CONCURRENTLY is not used: Prisma applies this migration in a
-- transaction, and the current keywords table is small enough for the regular index lock.
CREATE INDEX "keywords_projectId_normalized_text_idx"
ON "keywords" ("projectId", lower(btrim("text")));
