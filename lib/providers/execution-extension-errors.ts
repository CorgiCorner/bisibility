import {
  type BudgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";

const affectedProjectIds = new WeakMap<DeploymentAdmissionExhaustedError, string>();

/** A deployment admission refusal, independent of the provider's own billing. */
export class DeploymentAdmissionExhaustedError extends Error {
  readonly reason: "balance" | "budget";
  readonly surface?: ProviderRequestSurface;
  readonly resetAt?: Date | null;
  readonly budgetReason?: BudgetDenialReason;
  readonly scope?: "wallet" | "connection";

  constructor(
    reason: "balance" | "budget" = "balance",
    options?: {
      surface?: ProviderRequestSurface;
      budgetReason?: BudgetDenialReason;
      resetAt?: Date | null;
      scope?: "wallet" | "connection";
      /** Persisted project id supplied by trusted deployment admission. Never from request input. */
      projectId?: string;
    },
  ) {
    super(
      options?.budgetReason === "budget_missing"
        ? MISSING_PROJECT_BUDGET_MESSAGE
        : options?.budgetReason === "usage_reconciliation_required"
          ? UNRESOLVED_USAGE_MESSAGE
          : reason === "balance"
            ? "Deployment credits are exhausted."
            : "Deployment spending budget is exhausted.",
    );
    this.name = "DeploymentAdmissionExhaustedError";
    this.reason = reason;
    this.surface = options?.surface;
    this.scope = options?.scope;
    this.budgetReason = options?.budgetReason;
    this.resetAt = options?.resetAt;
    if (options?.projectId) affectedProjectIds.set(this, options.projectId);
  }

  get projectId(): string | undefined {
    return affectedProjectIds.get(this);
  }
}
