import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { ProviderSpendSourceBlock } from "@/lib/queries/provider-spend-types";
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

/** `own` = the project's own provider keys; `credits` = paid from the credit wallet. */
export type BudgetSource = "own" | "credits";
export type BudgetSurface = "app" | "programmatic";
export type BudgetSourceValues = Record<BudgetSurface, string>;
/** Raw field values for one connection; own keys and credits never share a field. */
export type BudgetFormValues = Record<BudgetSource, BudgetSourceValues>;

export class ProviderAvailabilityBudgetError extends Error {
  constructor(readonly reason: "incompatible" | "unavailable") {
    super(reason);
  }
}

export function sourceBlock(
  connection: ProviderSpendConnection,
  source: BudgetSource,
): ProviderSpendSourceBlock {
  return source === "own" ? connection.own : connection.credits;
}

/** Own keys use the provider catalog unit; credits are always money. */
export function budgetUnit(connection: ProviderSpendConnection, source: BudgetSource) {
  return sourceBlock(connection, source).unit;
}

export function budgetInitialValue(
  connection: ProviderSpendConnection,
  source: BudgetSource = "own",
  surface: BudgetSurface = "app",
) {
  const block = sourceBlock(connection, source);
  const allocation = block.surfaces[surface].allocation;
  if (!allocation) return "";
  return block.unit === "cents"
    ? (allocation.amountPerMonth / 100).toFixed(2)
    : String(allocation.amountPerMonth);
}

export function initialBudgetFormValues(connection: ProviderSpendConnection): BudgetFormValues {
  return {
    credits: {
      app: budgetInitialValue(connection, "credits", "app"),
      programmatic: budgetInitialValue(connection, "credits", "programmatic"),
    },
    own: {
      app: budgetInitialValue(connection, "own", "app"),
      programmatic: budgetInitialValue(connection, "own", "programmatic"),
    },
  };
}

function surfaceBudgetPayload(
  unit: ProviderSpendSourceBlock["unit"],
  rawValue: string,
): NonNullable<ProviderAllocationInput["allocation"]> | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (unit === "cents") return { amountDollars: trimmed, unit: "cents" };
  return { amount: Number(trimmed), unit: "units" };
}

export function budgetFieldChanged(
  connection: ProviderSpendConnection,
  rawValue: string,
  source: BudgetSource = "own",
  surface: BudgetSurface = "app",
): boolean {
  const trimmed = rawValue.trim();
  const hadAllocation = sourceBlock(connection, source).surfaces[surface].allocation !== null;
  if (!trimmed) return hadAllocation;
  if (!hadAllocation) return true;
  return trimmed !== budgetInitialValue(connection, source, surface);
}

export function budgetFormChanged(connection: ProviderSpendConnection, values: BudgetFormValues) {
  return (["own", "credits"] as const).some((source) =>
    (["app", "programmatic"] as const).some((surface) =>
      budgetFieldChanged(connection, values[source][surface], source, surface),
    ),
  );
}

/** Only changed budgets are sent; an omitted field keeps its stored budget. */
export function buildProviderAllocationPayload(
  connection: ProviderSpendConnection,
  values: BudgetFormValues,
): ProviderAllocationInput {
  const changed = (source: BudgetSource, surface: BudgetSurface) =>
    budgetFieldChanged(connection, values[source][surface], source, surface);
  const ownValue = (surface: BudgetSurface) =>
    surfaceBudgetPayload(connection.own.unit, values.own[surface]);
  const creditsValue = (surface: BudgetSurface) => {
    const value = surfaceBudgetPayload("cents", values.credits[surface]);
    return value?.unit === "cents" ? value : null;
  };
  return {
    connectionId: connection.connectionId,
    ...(changed("own", "app") ? { allocation: ownValue("app") } : {}),
    ...(changed("own", "programmatic") ? { programmaticAllocation: ownValue("programmatic") } : {}),
    ...(changed("credits", "app") ? { creditsAllocation: creditsValue("app") } : {}),
    ...(changed("credits", "programmatic")
      ? { creditsProgrammaticAllocation: creditsValue("programmatic") }
      : {}),
  };
}

/** Keeps exact schema parsing while exposing stable local presentation categories. */
export function budgetValidationIssue(
  connection: ProviderSpendConnection,
  rawValue: string,
  source: BudgetSource = "own",
): BudgetValidationIssue | null {
  const unit = budgetUnit(connection, source);
  const trimmed = rawValue.trim();
  if (
    unit === "units" &&
    trimmed.length > 0 &&
    Number.isFinite(Number(trimmed)) &&
    !Number.isInteger(Number(trimmed))
  ) {
    return "wholeUnits";
  }
  const parsed = providerAllocationSchema.safeParse({
    allocation: surfaceBudgetPayload(unit, rawValue),
    connectionId: connection.connectionId,
  });
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

/**
 * The own-keys app budget that leaves exactly the provider balance: this month's
 * own-key app usage plus what the provider still holds.
 */
export function budgetFromProviderAvailability(connection: ProviderSpendConnection): string {
  const available = connection.availableAtProvider;
  if (
    available?.status !== "available" ||
    !Number.isFinite(available.amount) ||
    available.amount <= 0
  ) {
    throw new ProviderAvailabilityBudgetError("unavailable");
  }
  const unit = connection.own.unit;
  const remaining =
    unit === "cents" && available.unit === "usd"
      ? Math.floor(available.amount * 100 + 1e-8)
      : unit === "units" && available.unit === "searches"
        ? Math.floor(available.amount)
        : null;
  if (remaining === null || remaining <= 0)
    throw new ProviderAvailabilityBudgetError("incompatible");
  const total = Math.ceil(connection.own.surfaces.app.used) + remaining;
  return unit === "cents" ? (total / 100).toFixed(2) : String(total);
}

/**
 * The credits app budget that leaves exactly the wallet balance: credits spent
 * this month on this connection's app surface plus the spendable wallet balance.
 */
export function budgetFromCreditBalance(
  connection: ProviderSpendConnection,
  walletBalanceCents: number | null,
): string {
  if (walletBalanceCents === null || !Number.isFinite(walletBalanceCents)) {
    throw new ProviderAvailabilityBudgetError("unavailable");
  }
  const remaining = Math.floor(walletBalanceCents + 1e-8);
  if (remaining <= 0) throw new ProviderAvailabilityBudgetError("unavailable");
  const total = Math.ceil(connection.credits.surfaces.app.used) + remaining;
  return (total / 100).toFixed(2);
}
