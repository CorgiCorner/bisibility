import { createHash } from "node:crypto";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { Budget, BudgetScope } from "@usagekit/core";
import { decimalQuantity } from "./mapping";
import { platformAllocationTag } from "./paid-quote";

export const fundingBudgetId = (
  connection: string,
  funding: "byok" | "platform",
  surface: string,
) => `${funding === "byok" ? "own-connection" : "connection"}:${connection}:${surface}`;

export function projectSpendingBudget(
  namespace: string,
  project: string,
  capCents: string | null,
  version: number,
): Budget {
  const negative = capCents?.startsWith("-");
  const limit =
    capCents === null
      ? null
      : decimalQuantity(negative ? capCents.slice(1) : capCents, "budget_cents", 4);
  return {
    id: `project:${project}:monthly`,
    version,
    scope: { kind: "group", namespace, group: project },
    surface: "any",
    unit: "budget_cents",
    // A zero legacy project cap is unlimited; zero connection limits remain blocking.
    limit: negative || limit?.value === 0n ? null : limit,
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "block",
  };
}
export function fundingSpendingBudgets(
  namespace: string,
  connection: {
    id: string;
    provider: string;
    unit: "cents" | "units";
    app: string | null;
    programmatic: string | null;
  },
  funding: "byok" | "platform",
  version: number,
): Budget[] {
  const unit = funding === "platform" ? "customer_cents" : connection.unit;
  const tag =
    funding === "platform"
      ? platformAllocationTag(connection.provider, connection.id)
      : ownAllocationTag(connection.provider, connection.id);
  return (["app", "programmatic"] as const).map((surface) => ({
    id: fundingBudgetId(connection.id, funding, surface),
    version,
    scope: { kind: "tag", namespace, tag },
    surface,
    unit,
    limit:
      connection[surface] === null
        ? null
        : decimalQuantity(connection[surface], unit, unit === "units" ? 6 : 4),
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "block",
  }));
}
/** Only reconciliation may supersede these gates after verifying restored historical counters. */
export function unresolvedSpendingGate(
  scope: Extract<BudgetScope, { kind: "group" | "connection" }>,
  migrationId: string,
  cutoverAt: string,
  version: number,
): Budget {
  return {
    id: `unresolved:${createHash("sha256")
      .update(
        JSON.stringify([
          scope.namespace,
          scope.kind,
          scope.kind === "group" ? scope.group : scope.connection,
          migrationId,
        ]),
      )
      .digest("hex")}`,
    version,
    scope,
    surface: "any",
    unit: "paid_attempts",
    limit: { unit: "paid_attempts", value: 0n, scale: 0 },
    onExceed: "block",
    window: { kind: "since_reset", epoch: migrationId, startsAt: cutoverAt },
  };
}
