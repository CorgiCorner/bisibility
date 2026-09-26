import { type AccessContext, compareQuantity, type Meter, type ReserveInput } from "@usagekit/core";

/** A non-authoritative snapshot. Only reserve can enforce admission atomically. */
export async function readShadowDecision(
  meter: Meter,
  access: AccessContext,
  input: ReserveInput,
): Promise<"reserved" | "exceeded" | "invalid"> {
  const result = await meter.applicableBudgets(access, {
    scope: input.scope,
    surface: input.surface,
    units: input.estimate.map((q) => q.unit),
    platformPools: input.platformPools,
  });
  if (result.outcome !== "ok") throw new Error("Shadow budgets unavailable");
  let exceeded = false;
  for (const status of result.value) {
    const estimate = input.estimate.find((q) => q.unit === status.budget.unit);
    if (!estimate || status.redacted) return "invalid";
    if (status.budget.limit === null) continue;
    if (status.remaining === null) return "invalid";
    if (compareQuantity(estimate, status.remaining) > 0) exceeded = true;
  }
  return exceeded ? "exceeded" : "reserved";
}
