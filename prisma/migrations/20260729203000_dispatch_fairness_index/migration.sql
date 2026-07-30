CREATE INDEX "keyword_dispatch_states_nextCheckAt_keywordId_idx"
ON "keyword_dispatch_states"("nextCheckAt", "keywordId");

DROP INDEX "keyword_dispatch_states_nextCheckAt_idx";
