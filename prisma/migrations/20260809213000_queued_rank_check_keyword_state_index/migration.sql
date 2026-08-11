-- The keyword detail and keywords list queries select active queued tasks per keyword.
-- Without a keywordId-leading index that lookup scans a table nothing prunes.
CREATE INDEX "queued_rank_check_tasks_keywordId_state_idx" ON "queued_rank_check_tasks"("keywordId" ASC, "state" ASC);
