import { formatMoneyCents } from "@/lib/format/money";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import {
  type ProviderAllocationInput,
  providerAllocationSchema,
} from "@/lib/schemas/usage-settings";

export const BUDGET_MODAL_CONSEQUENCE_COPY =
  "When a budget is reached, checks and lookups using that provider stop until next month.";

export function budgetInitialValue(connection: ProviderSpendConnection) {
  if (!connection.allocation) return "";
  return connection.unit === "cents"
    ? (connection.allocation.amountPerMonth / 100).toFixed(2)
    : String(connection.allocation.amountPerMonth);
}

function formatUsageAmount(amount: number, unit: ProviderSpendConnection["unit"]) {
  if (unit === "cents") return formatMoneyCents(amount);
  return `${amount.toLocaleString("en-US")} searches`;
}

export function providerUsageContextLine(connection: ProviderSpendConnection) {
  const thisMonth = formatUsageAmount(connection.used, connection.unit);
  const lastMonth = formatUsageAmount(connection.usedPriorMonth, connection.unit);
  return `${thisMonth} this month · ${lastMonth} last month`;
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

export function validateBudgetField(
  connection: ProviderSpendConnection,
  rawValue: string,
): string | null {
  const parsed = providerAllocationSchema.safeParse(
    buildProviderAllocationPayload(connection, rawValue),
  );
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Enter a valid budget.";
}

export function budgetFieldChanged(connection: ProviderSpendConnection, rawValue: string): boolean {
  const trimmed = rawValue.trim();
  const hadAllocation = connection.allocation !== null;
  if (!trimmed) return hadAllocation;
  if (!hadAllocation) return true;
  return trimmed !== budgetInitialValue(connection);
}
