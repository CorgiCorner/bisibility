-- No backfill: historical rows never acquire notification window membership.
ALTER TABLE "rank_checks"
  ADD COLUMN "terminalPersistedAt" TIMESTAMP(3),
  ADD COLUMN "comparisonAllowed" BOOLEAN,
  ADD COLUMN "recoveryRestoredAt" TIMESTAMP(3);
CREATE INDEX "rank_checks_terminal_summary_window_idx"
  ON "rank_checks" (COALESCE("finishedAt", "checkedAt"), "terminalPersistedAt")
  WHERE "terminalPersistedAt" IS NOT NULL;
