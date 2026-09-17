import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import {
  type ProviderAllocationInput,
  providerAllocationSchema,
} from "@/lib/schemas/usage-settings";

export type BudgetValidationIssue =
  | "invalid"
  | "invalidDecimal"
  | "positiveMoney"
  | "positiveUnits"
  | "tooLarge"
  | "wholeUnits";

export class ProviderAvailabilityBudgetError extends Error {
  constructor(readonly reason: "incompatible" | "unavailable") {
    super(reason);
  }
}

export function budgetInitialValue(connection: ProviderSpendConnection) {
  if (!connection.allocation) return "";
  return connection.unit === "cents"
    ? (connection.allocation.amountPerMonth / 100).toFixed(2)
    : String(connection.allocation.amountPerMonth);
}

export function buildProviderAllocationPayload(
  connection: ProviderSpendConnection,
  rawValue: string,
): ProviderAllocationInput {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { allocation: null, connectionId: connection.connectionId };
  }
  if (connection.unit === "cents") {
    return {
      allocation: { amountDollars: trimmed, unit: "cents" },
      connectionId: connection.connectionId,
    };
  }
  return {
    allocation: { amount: Number(trimmed), unit: "units" },
    connectionId: connection.connectionId,
  };
}

/** Keeps exact schema parsing while exposing stable local presentation categories. */
export function budgetValidationIssue(
  connection: ProviderSpendConnection,
  rawValue: string,
): BudgetValidationIssue | null {
  const trimmed = rawValue.trim();
  if (
    connection.unit === "units" &&
    trimmed.length > 0 &&
    Number.isFinite(Number(trimmed)) &&
    !Number.isInteger(Number(trimmed))
  ) {
    return "wholeUnits";
  }
  const parsed = providerAllocationSchema.safeParse(
    buildProviderAllocationPayload(connection, rawValue),
  );
  if (parsed.success) return null;
  const message = parsed.error.issues[0]?.message;
  if (message === "Enter a positive amount with up to two decimals.") return "invalidDecimal";
  if (message === "Enter a positive monthly budget.") return "positiveMoney";
  if (message === "Enter a whole number of units.") return "wholeUnits";
  if (message === "Enter a positive number of units.") return "positiveUnits";
  if (
    message === "Monthly allocation is too large." ||
    message === "Monthly budget is too large."
  ) {
    return "tooLarge";
  }
  return "invalid";
}

export function budgetFieldChanged(connection: ProviderSpendConnection, rawValue: string): boolean {
  const trimmed = rawValue.trim();
  const hadAllocation = connection.allocation !== null;
  if (!trimmed) return hadAllocation;
  if (!hadAllocation) return true;
  return trimmed !== budgetInitialValue(connection);
}

export function budgetFromProviderAvailability(connection: ProviderSpendConnection): string {
  const available = connection.availableAtProvider;
  if (
    available?.status !== "available" ||
    !Number.isFinite(available.amount) ||
    available.amount <= 0
  ) {
    throw new ProviderAvailabilityBudgetError("unavailable");
  }
  const remaining =
    connection.unit === "cents" && available.unit === "usd"
      ? Math.floor(available.amount * 100 + 1e-8)
      : connection.unit === "units" && available.unit === "searches"
        ? Math.floor(available.amount)
        : null;
  if (remaining === null || remaining <= 0)
    throw new ProviderAvailabilityBudgetError("incompatible");
  const total = Math.ceil(connection.used) + remaining;
  return connection.unit === "cents" ? (total / 100).toFixed(2) : String(total);
}
