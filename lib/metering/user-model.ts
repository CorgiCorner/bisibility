import type { BudgetStatus, Operation } from "@usagekit/core";
import type { VerifiedOwnBudgetBinding } from "./own-budget-read-types";
import type { VerifiedPlatformBudgetBinding } from "./platform-budget-read";
import type { ProjectBudgetDisplay, ProjectBudgetRow } from "./project-budget-display";
import {
  parseProjectFundingBudgetId,
  projectBudgetId,
  projectFundingTag,
} from "./project-funding-budgets";
import { type BudgetFigures, type BudgetFiguresInput, sharedBudgetRow } from "./shared-budget-row";

export function projectBudgetRow(
  status: BudgetStatus,
  connection: string | null,
  figures: BudgetFiguresInput = false,
  provider: string | null = null,
  binding?: VerifiedOwnBudgetBinding | VerifiedPlatformBudgetBinding,
  displayLabel?: string,
  display?: ProjectBudgetDisplay,
): ProjectBudgetRow | null {
  if (binding && status.budget.scope.kind !== "tag") return null;
  const funding = binding ? null : parseProjectFundingBudgetId(status.budget.id);
  // A project funding limit is project-wide, like the shared group cap it replaces.
  const projectFunding =
    funding !== null &&
    status.budget.scope.kind === "tag" &&
    status.budget.scope.tag === projectFundingTag(funding.fundingSource, funding.projectId);
  const verifiedTag =
    status.budget.scope.kind === "tag" &&
    binding &&
    status.budget.scope.namespace === binding.namespace &&
    status.budget.scope.tag === binding.tag &&
    status.budget.unit === binding.unit &&
    provider === binding.provider &&
    connection === binding.publicConnection;
  if (
    status.redacted ||
    (!verifiedTag && !projectFunding && !["group", "connection"].includes(status.budget.scope.kind))
  )
    return null;
  const connectionScope = verifiedTag || status.budget.scope.kind === "connection";
  const row = sharedBudgetRow(status, connectionScope ? connection : null, figures, displayLabel);
  return row
    ? {
        ...row,
        ...(display
          ? {
              display: {
                projectName: display.projectName,
                ...(connectionScope && display.connectionId
                  ? { connectionId: display.connectionId }
                  : {}),
                ...(connectionScope && display.providerLabel
                  ? { providerLabel: display.providerLabel }
                  : {}),
              },
            }
          : {}),
      }
    : null;
}

/** Whether a provider-measured receipt fixes this operation's share of a budget unit. */
export function contributionCertainty(operation: Operation, unit: string): BudgetFigures {
  // A released admission never reached the provider and adds nothing to the counter.
  if (operation.state === "released") return "measured";
  if (operation.state !== "settled") return "estimated";
  const measurement = operation.receipts
    .at(-1)
    ?.measurements.find((candidate) => candidate.unit === unit);
  return measurement?.quantity && measurement.certainty === "measured" ? "measured" : "estimated";
}

/** The counter itself was read: present, in the budget's own unit and not redacted. */
export function readableBudgetCounter(status: BudgetStatus) {
  return (
    !status.redacted &&
    status.used?.unit === status.budget.unit &&
    status.reserved?.unit === status.budget.unit
  );
}

export function zeroBudgetCounter(status: BudgetStatus) {
  return (
    readableBudgetCounter(status) && status.used?.value === 0n && status.reserved?.value === 0n
  );
}

/**
 * Limit figures come from the project's own counter: provider connections are unique per
 * project, so the counter is this key's consumption in this project, also after an owner
 * transfer. Certainty only says whether every contributing operation has a provider-measured
 * receipt. Unknown means the read failed: no readable counter, or a non-zero counter whose
 * epoch operations could not be read completely or do not match it.
 */
export function projectBudgetFigures(
  status: BudgetStatus,
  operations: readonly Operation[],
  complete: boolean,
  ownBinding?: VerifiedOwnBudgetBinding,
): BudgetFigures {
  if (
    !readableBudgetCounter(status) ||
    (ownBinding &&
      (status.budget.scope.kind !== "tag" ||
        status.budget.scope.namespace !== ownBinding.namespace ||
        status.budget.scope.tag !== ownBinding.tag ||
        status.budget.unit !== ownBinding.unit))
  )
    return "unknown";
  const funding = ownBinding ? null : parseProjectFundingBudgetId(status.budget.id);
  // A split budget's opening usage came from this source's work on the shared group cap.
  const contributes = (operation: Operation) =>
    operation.budgetEpochs.some(
      (epoch) =>
        epoch.epoch === status.epoch.epoch &&
        (epoch.budgetId === status.budget.id ||
          (funding !== null &&
            epoch.budgetId === projectBudgetId(funding.projectId) &&
            operation.fundingSource === funding.fundingSource)),
    );
  const unit = status.budget.unit;
  const contributing = operations.filter(contributes);
  // Platform provider cost stays private to the platform; it is never a customer figure.
  if (unit === "cents" && contributing.some((operation) => operation.fundingSource === "platform"))
    return "unknown";
  const certainty = contributing.every(
    (operation) => contributionCertainty(operation, unit) === "measured",
  )
    ? "measured"
    : "estimated";
  // A zero counter needs no epoch proof; unmeasured work seen in the read still marks it.
  if (zeroBudgetCounter(status)) return certainty;
  if (!complete) return "unknown";
  // Own-key work on this surface that never reached its counter means the read is corrupt.
  if (
    ownBinding &&
    operations.some(
      (operation) =>
        operation.scope.tags?.includes(ownBinding.tag) &&
        operation.surface === status.budget.surface &&
        !contributes(operation),
    )
  )
    return "unknown";
  return certainty;
}
