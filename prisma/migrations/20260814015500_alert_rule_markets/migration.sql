-- Optional market scoping for alert rules. Existing rules have no rows and
-- therefore retain the legacy All markets behavior.
CREATE TABLE "alert_rule_markets" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "projectMarketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rule_markets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_rule_markets_ruleId_projectMarketId_key"
ON "alert_rule_markets"("ruleId", "projectMarketId");

CREATE INDEX "alert_rule_markets_projectMarketId_idx"
ON "alert_rule_markets"("projectMarketId");

ALTER TABLE "alert_rule_markets"
ADD CONSTRAINT "alert_rule_markets_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_rule_markets"
ADD CONSTRAINT "alert_rule_markets_projectMarketId_fkey"
FOREIGN KEY ("projectMarketId") REFERENCES "project_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
