import {
  type BudgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { PROVIDER_CATALOG } from "./catalog-metadata";

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

/**
 * The account runs paid provider work only on its own provider keys, and no usable own key serves
 * this request. Raised before any provider dispatch, so nothing was spent. It extends the
 * deployment admission refusal so every path that already stops or falls back on a refused
 * admission (rank-check provider chains, deferred scheduled checks, lookup results) treats it the
 * same way; API surfaces map it to the `byok_required` problem type.
 */
export class OwnProviderKeyRequiredError extends DeploymentAdmissionExhaustedError {
  /** Provider whose own key would serve the request, for example `dataforseo`. */
  readonly provider: string;
  /** Paid capability that needs the key, for example `keyword_research` or `rank_check`. */
  readonly capability: string;

  constructor(input: { provider: string; capability: string; projectId?: string }) {
    super("balance", input.projectId ? { projectId: input.projectId } : undefined);
    this.name = "OwnProviderKeyRequiredError";
    const label =
      PROVIDER_CATALOG.find((entry) => entry.id === input.provider)?.label ?? input.provider;
    this.message = `This account runs paid provider work only on its own provider keys. Connect your own ${label} key in the project's provider settings to run ${input.capability.replaceAll("_", " ")}.`;
    this.provider = input.provider;
    this.capability = input.capability;
  }
}
