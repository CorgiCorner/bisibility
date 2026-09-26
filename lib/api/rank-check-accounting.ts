import "server-only";

import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import {
  type RunLedgerActual,
  rankCheckLedgerActuals,
} from "@/lib/queries/rank-check-run-accounting";
import type { RankCheckRecord } from "./resources";
import { type RankCheckAccountingOverride, rankCheckResource } from "./resources";

export type { RankCheckAccountingOverride };

function quotaProvider(provider: string) {
  const allocation = providerAllocationMetadata(provider);
  return allocation?.kind === "billable" && allocation.billing === "quota";
}

/**
 * Ledger-derived usage and cost for one rank check. An unknown receipt keeps
 * both null even when the stored check fields are known, mixed providers never
 * sum their units, and metered providers report the recorded cost as cents.
 */
export function rankCheckAccountingOverride(
  check: Pick<RankCheckRecord, "provider">,
  ledger: RunLedgerActual | undefined,
): RankCheckAccountingOverride | undefined {
  if (!ledger || ledger.receiptCount === 0) return undefined;
  return {
    costCents: ledger.costCents,
    usageQuantity: quotaProvider(check.provider)
      ? ledger.unitProvider === check.provider
        ? ledger.units
        : null
      : ledger.costCents,
  };
}

/**
 * Ledger-aware API serialization for a page of rank checks: one batched ledger
 * read replaces the stored per-check usage fields, which only describe the
 * final provider attempt. Checks predating the ledger keep their measured
 * stored fields; once receipts exist the ledger decides, unconfirmed null
 * included. The project comes from the trusted API context or the verified
 * check keyword, never from client input.
 */
export async function rankCheckResources(projectId: string, checks: readonly RankCheckRecord[]) {
  if (checks.length === 0) return [];
  const ledger = await rankCheckLedgerActuals(
    projectId,
    checks.map((check) => check.id),
  );
  return checks.map((check) =>
    rankCheckResource(check, rankCheckAccountingOverride(check, ledger.get(check.id))),
  );
}
