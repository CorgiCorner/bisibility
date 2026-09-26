-- Own keys and credits keep separate monthly budgets per connection. Both new
-- budgets are in cents of charged credits price; null means no budget.
ALTER TABLE "provider_connections"
ADD COLUMN "creditsAllocationAmountPerMonth" INTEGER,
ADD COLUMN "creditsProgrammaticAllocationAmountPerMonth" INTEGER;

-- Budgets on connections that run on credits today were already set in cents of
-- credits price. Move them to the credits budget; the own-keys budget starts empty.
UPDATE "provider_connections"
SET
  "creditsAllocationAmountPerMonth" = CASE
    WHEN "allocationUnit" = 'cents' THEN "allocationAmountPerMonth"
    ELSE NULL
  END,
  "creditsProgrammaticAllocationAmountPerMonth" = "programmaticAllocationAmountPerMonth",
  "allocationUnit" = NULL,
  "allocationAmountPerMonth" = NULL,
  "programmaticAllocationAmountPerMonth" = NULL
WHERE "credentialSource" = 'hosted';
