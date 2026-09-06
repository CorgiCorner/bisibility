-- Enforce one active target per project-scoped keyword.
CREATE UNIQUE INDEX "rank_check_run_items_keywordId_running_key"
ON "rank_check_run_items" ("keywordId")
WHERE "status" = 'running';
