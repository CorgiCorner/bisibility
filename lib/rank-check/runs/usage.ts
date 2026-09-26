export type RunUsageGroup = {
  runId: string | null;
  provider: string;
  requestedDepth: number | null;
  _count: { _all: number; billingUnits: number };
  _sum: { billingUnits: number | null };
};

/**
 * Provider-ledger receipts correlated with one run or one target. A positive
 * receipt count means the ledger owns the actuals; zero receipts means the run
 * predates the ledger and stored measurements may be used as a fallback.
 */
export type RunLedgerActual = {
  costCents: number | null;
  receiptCount: number;
  unitProvider: string | null;
  unconfirmedCount: number;
  units: number | null;
};

export type RunUsage = { actual: number | null; estimated: number | null; unit: "operations" };

export function runUsage(
  run: { selectionSpec: unknown; targetCount: number; startedTargets: number },
  groups: RunUsageGroup[],
  ledger?: RunLedgerActual | null,
): RunUsage | null {
  const spec =
    run.selectionSpec && typeof run.selectionSpec === "object"
      ? (run.selectionSpec as Record<string, unknown>)
      : {};
  if (
    (spec.providerAtLaunch ?? spec.providerId) !== "serpapi" &&
    !(groups.length > 0 && groups.every((group) => group.provider === "serpapi"))
  ) {
    return null;
  }
  const checks = groups.reduce((sum, group) => sum + group._count._all, 0);
  const recorded = groups.reduce((sum, group) => sum + group._count.billingUnits, 0);
  const complete =
    checks >= run.startedTargets &&
    recorded === checks &&
    groups.every((group) => group.provider === "serpapi");
  const savedEstimate = spec.estimatedOperations ?? spec.providerAllocationQuantity;
  const estimated =
    typeof savedEstimate === "number" && Number.isInteger(savedEstimate) && savedEstimate >= 0
      ? savedEstimate
      : checks === run.targetCount &&
          groups.every(
            (group) =>
              group.provider === "serpapi" &&
              group.requestedDepth !== null &&
              group.requestedDepth > 0,
          )
        ? groups.reduce(
            (sum, group) => sum + Math.ceil((group.requestedDepth ?? 0) / 10) * group._count._all,
            0,
          )
        : null;
  const ledgerUnits =
    ledger &&
    ledger.receiptCount > 0 &&
    ledger.unitProvider === "serpapi" &&
    groups.every((group) => group.provider === "serpapi")
      ? ledger.units
      : null;
  return {
    actual:
      ledger && ledger.receiptCount > 0
        ? ledgerUnits
        : complete
          ? groups.reduce((sum, group) => sum + (group._sum.billingUnits ?? 0), 0)
          : null,
    estimated,
    unit: "operations",
  };
}
