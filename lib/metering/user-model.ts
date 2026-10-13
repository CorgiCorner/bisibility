import type { BudgetStatus, Operation } from "@usagekit/core";
import type { BudgetRow } from "@usagekit/views";
import type { VerifiedOwnBudgetBinding } from "./own-budget-read-types";
import { sharedBudgetRow } from "./shared-budget-row";

export function projectBudgetRow(
  status: BudgetStatus,
  connection: string | null,
  figuresKnown = false,
  provider: string | null = null,
  ownBinding?: VerifiedOwnBudgetBinding,
  displayLabel?: string,
): BudgetRow | null {
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
  return (
    sharedBudgetRow(status, connectionScope ? connection : null, figuresKnown, displayLabel) ?? null
  );
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
  verifiedEmptyOwnEpoch = false,
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
  // Store spending-cap counters can prove zero without a provider receipt.
  if (!contributing.length)
    return (
      !status.redacted &&
      ((status.budget.scope.kind === "group" && status.budget.unit === "budget_cents") ||
        Boolean(
          ownBinding &&
            verifiedEmptyOwnEpoch &&
            originalProof?.size === 0 &&
            ownBinding.principal === principal &&
            status.budget.id === `own-connection:${ownBinding.connection}:${status.budget.surface}`,
        )) &&
      status.used?.unit === status.budget.unit &&
      status.reserved?.unit === status.budget.unit &&
      status.used.value === 0n &&
      status.reserved.value === 0n
    );
  return contributing.every(
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
  );
}
