-- Run after the additive schema migration commits, releasing its exclusive locks.
-- Map only the stored receipt cost certainty. Other dimensions are not stored and stay unset.
-- Meter amounts, wallets, ledgers and holds are not written.
INSERT INTO "provider_operation_evidence" ("operationPk", "accounting", "exhaustionStatus", "updatedAt")
SELECT latest.operation_pk,
  CASE
    WHEN latest.cost_certainty = 'measured' THEN 'measured'::"ProviderAccounting"
    ELSE 'unknown'::"ProviderAccounting"
  END,
  CASE
    WHEN latest.cost_certainty = 'measured' THEN 'not_applicable'::"ProviderAccountingExhaustion"
    ELSE 'pending'::"ProviderAccountingExhaustion"
  END,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (operation_pk) operation_pk, cost_certainty
  FROM "metering_receipt"
  ORDER BY operation_pk, sequence DESC
) AS latest
WHERE latest.cost_certainty IN ('measured', 'unknown');
