import type { BudgetStatus, Operation, UsageRow } from "@usagekit/core";
import { exactAmount } from "./admin-format";
import type { MeteringAuthorityCoverage } from "./authority";
import type { VerifiedOwnBudgetBinding } from "./own-budget-read-types";
import type { ProjectMeteringBudget, ProjectMeteringRow, ProjectMeteringUsage } from "./user-types";

export function projectUsageRow(row: UsageRow, connection: string | null): ProjectMeteringRow {
  const units = row.measurements.find((measurement) => measurement.unit === "units");
  const customer = row.measurements.find((measurement) => measurement.unit === "customer_cents");
  return {
    connection,
    provider: row.dimensions.provider ?? "",
    surface: row.dimensions.surface ?? "",
    source: row.dimensions.source ?? "",
    funding: row.fundingSource,
    // A platform's upstream payer and commercial costs are private. Its acknowledged
    // customer quantity is separate from provider cost and never means wallet balance.
    providerCost:
      row.fundingSource === "byok" && row.cost.money ? exactAmount(row.cost.money.units, 6) : null,
    customerCharge:
      row.fundingSource === "platform" && customer?.certainty === "measured" && customer.quantity
        ? exactAmount(customer.quantity.value, customer.quantity.scale + 2)
        : null,
    units: units?.quantity ? exactAmount(units.quantity.value, units.quantity.scale) : null,
    unitsCertainty: units?.certainty ?? "unknown",
    certainty:
      row.fundingSource === "platform" ? (customer?.certainty ?? "unknown") : row.cost.certainty,
    unknownOperations: row.unknownOperations.toString(),
  };
}

export function projectBudgetRow(
  status: BudgetStatus,
  connection: string | null,
  figuresKnown = false,
  provider: string | null = null,
  ownBinding?: VerifiedOwnBudgetBinding,
): ProjectMeteringBudget | null {
  if (ownBinding && status.budget.scope.kind !== "tag") return null;
  const own =
    status.budget.scope.kind === "tag" &&
    ownBinding &&
    status.budget.scope.namespace === ownBinding.namespace &&
    status.budget.scope.tag === ownBinding.tag &&
    status.budget.unit === ownBinding.unit &&
    provider === ownBinding.provider &&
    connection === ownBinding.publicConnection;
  if (status.redacted || (!own && !["group", "connection"].includes(status.budget.scope.kind)))
    return null;
  const connectionScope = own || status.budget.scope.kind === "connection";
  const amount = (quantity: BudgetStatus["used"]) =>
    quantity ? exactAmount(quantity.value, quantity.scale) : null;
  return {
    provider: connectionScope ? provider : null,
    figuresKnown,
    connection: connectionScope ? connection : null,
    scope: connectionScope ? "connection" : "project",
    surface: status.budget.surface,
    unit: status.budget.unit,
    used: figuresKnown ? amount(status.used) : null,
    reserved: figuresKnown ? amount(status.reserved) : null,
    remaining: figuresKnown ? amount(status.remaining) : null,
    limit: amount(status.budget.limit),
    hardLimit: amount(status.budget.hardLimit ?? null),
    unlimited: status.budget.limit === null,
    policy: status.budget.onExceed,
    resetsAt: status.epoch.endsAt,
  };
}

/** A connection/group bound can retain another owner's charges after transfer. Only
 * expose its figures after a complete epoch read proves observation and sole ownership. */
export function projectBudgetFiguresKnown(
  status: BudgetStatus,
  operations: readonly Operation[],
  principal: string,
  complete: boolean,
  ownBinding?: VerifiedOwnBudgetBinding,
  originalProof?: ReadonlySet<Operation>,
) {
  if (!complete) return false;
  if (
    ownBinding &&
    (status.redacted ||
      status.budget.scope.kind !== "tag" ||
      status.budget.scope.namespace !== ownBinding.namespace ||
      status.budget.scope.tag !== ownBinding.tag ||
      status.budget.unit !== ownBinding.unit)
  )
    return false;
  const contributes = (operation: Operation) =>
    operation.budgetEpochs.some(
      (epoch) => epoch.budgetId === status.budget.id && epoch.epoch === status.epoch.epoch,
    );
  if (
    ownBinding &&
    operations.some(
      (operation) =>
        operation.scope.tags?.includes(ownBinding.tag) &&
        operation.surface === status.budget.surface &&
        !contributes(operation),
    )
  )
    return false;
  const contributing = operations.filter(contributes);
  return (
    contributing.length > 0 &&
    contributing.every(
      (operation) =>
        operation.scope.principal === principal &&
        (!ownBinding ||
          (operation.scope.namespace === ownBinding.namespace &&
            operation.scope.group === ownBinding.group &&
            operation.scope.connection === ownBinding.connection &&
            operation.scope.tags?.includes(ownBinding.tag) &&
            operation.provider === ownBinding.provider &&
            originalProof?.has(operation) === true &&
            operation.fundingSource === "byok" &&
            operation.costOwner === ownBinding.principal &&
            (operation.state === "released" ||
              (operation.state === "settled" &&
                operation.receipts
                  .at(-1)
                  ?.measurements.some(
                    (measurement) =>
                      measurement.unit === ownBinding.unit &&
                      measurement.certainty === "measured" &&
                      measurement.quantity !== null,
                  ))))) &&
        !(status.budget.unit === "cents" && operation.fundingSource === "platform"),
    )
  );
}

export function projectAuthority(
  coverage: readonly MeteringAuthorityCoverage[],
  completeInventory: boolean,
): ProjectMeteringUsage["authority"] {
  if (!completeInventory) return "unknown";
  if (
    !coverage.length ||
    coverage.every((entry) => entry.mode === "legacy" && entry.coverage === "none")
  )
    return "legacy";
  if (coverage.some((entry) => entry.mode === "preparing")) return "preparing";
  if (coverage.some((entry) => entry.mode === "draining")) return "draining";
  return coverage.every((entry) => entry.mode === "active" && entry.coverage === "full")
    ? "active"
    : "mixed";
}
