-- The monthly provider budget cap moves from the RANK_CHECK_MONTHLY_COST_CAP_CENTS
-- env var to a per-workspace column, seeded at $50.00 (5000 cents). Operators who
-- overrode the env var must re-apply their cap in Settings > Provider usage.
ALTER TABLE "projects"
ADD COLUMN "budgetCapCents" INTEGER NOT NULL DEFAULT 5000;
