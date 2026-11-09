export type CapacityLimitDetails = {
  dimension: string;
  limit: number;
  used: number;
  requested: number;
  scope: "account" | "project";
  resetsAt?: string;
  suggestedPlan?: string;
  upgradeUrl?: string;
};

export class CapacityLimitError extends Error {
  readonly code = "plan_limit_reached";
  readonly dimension: string;
  readonly limit: number;
  readonly used: number;
  readonly requested: number;
  readonly scope: "account" | "project";
  readonly resetsAt?: string;
  readonly suggestedPlan?: string;
  readonly upgradeUrl?: string;

  constructor(details: CapacityLimitDetails, message = "This capacity limit has been reached.") {
    super(message);
    this.name = "CapacityLimitError";
    this.dimension = details.dimension;
    this.limit = details.limit;
    this.used = details.used;
    this.requested = details.requested;
    this.scope = details.scope;
    this.resetsAt = details.resetsAt;
    this.suggestedPlan = details.suggestedPlan;
    this.upgradeUrl = details.upgradeUrl;
  }

  toJSON(): CapacityLimitDetails & { code: string } {
    return {
      code: this.code,
      dimension: this.dimension,
      limit: this.limit,
      used: this.used,
      requested: this.requested,
      scope: this.scope,
      ...(this.resetsAt ? { resetsAt: this.resetsAt } : {}),
      ...(this.suggestedPlan ? { suggestedPlan: this.suggestedPlan } : {}),
      ...(this.upgradeUrl ? { upgradeUrl: this.upgradeUrl } : {}),
    };
  }
}
