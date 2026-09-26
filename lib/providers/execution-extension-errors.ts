import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";

const affectedProjectIds = new WeakMap<DeploymentAdmissionExhaustedError, string>();

/** A deployment admission refusal, independent of the provider's own billing. */
export class DeploymentAdmissionExhaustedError extends Error {
  readonly reason: "balance" | "budget";
  readonly surface?: ProviderRequestSurface;
  readonly scope?: "wallet" | "connection";

  constructor(
    reason: "balance" | "budget" = "balance",
    options?: {
      surface?: ProviderRequestSurface;
      scope?: "wallet" | "connection";
      /** Persisted project id supplied by trusted deployment admission. Never from request input. */
      projectId?: string;
    },
  ) {
    super(
      reason === "balance"
        ? "Deployment credits are exhausted."
        : "Deployment spending budget is exhausted.",
    );
    this.name = "DeploymentAdmissionExhaustedError";
    this.reason = reason;
    this.surface = options?.surface;
    this.scope = options?.scope;
    if (options?.projectId) affectedProjectIds.set(this, options.projectId);
  }

  get projectId(): string | undefined {
    return affectedProjectIds.get(this);
  }
}
