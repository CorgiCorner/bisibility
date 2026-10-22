import { createHash } from "node:crypto";
import type { Budget, FundingSource } from "@usagekit/core";
import { decimalQuantity } from "./mapping";

/** Project-wide limits per funding source; the group budget stays the existence marker. */
export type ProjectFunding = FundingSource;

export const projectFundingTag = (funding: ProjectFunding, projectId: string) =>
  createHash("sha256")
    .update(JSON.stringify(["project-funding", funding, projectId]))
    .digest("hex");

export const projectBudgetId = (projectId: string) => `project:${projectId}:monthly`;
export const projectFundingBudgetId = (funding: ProjectFunding, projectId: string) =>
  `${funding === "byok" ? "own-project" : "credits-project"}:${projectId}:monthly`;

/** Hosted connections draw Credits; every other credential is your own key. */
export const connectionFunding = (credentialSource?: string | null): ProjectFunding =>
  credentialSource === "hosted" ? "platform" : "byok";

const fundingBudgetPattern = /^(own-project|credits-project):(.+):monthly$/;
/** Recognise a project funding budget from an admission denial. */
export function parseProjectFundingBudgetId(id: string) {
  const match = fundingBudgetPattern.exec(id);
  if (!match?.[2]) return null;
  return {
    projectId: match[2],
    fundingSource: (match[1] === "own-project" ? "byok" : "platform") as ProjectFunding,
  };
}

/** Credits limits count customer charges; your-key limits keep the admission valuation. */
export const projectFundingUnit = (funding: ProjectFunding) =>
  funding === "platform" ? "customer_cents" : "budget_cents";

export function projectFundingBudget(
  namespace: string,
  projectId: string,
  funding: ProjectFunding,
  capCents: string | null,
  version: number,
): Budget {
  const unit = projectFundingUnit(funding);
  return {
    id: projectFundingBudgetId(funding, projectId),
    version,
    scope: { kind: "tag", namespace, tag: projectFundingTag(funding, projectId) },
    surface: "any",
    unit,
    limit: capCents === null ? null : decimalQuantity(capCents, unit, 4),
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "block",
  };
}

/** A project is split once its your-key budget exists; until then the group cap applies to all. */
export function projectFundingBudgetScopes(namespace: string, projectId: string) {
  return (["byok", "platform"] as const).map((funding) => ({
    kind: "tag" as const,
    namespace,
    tag: projectFundingTag(funding, projectId),
  }));
}

export function selectProjectLimit(
  budgets: readonly Budget[],
  projectId: string,
  funding: ProjectFunding,
): { mode: "single" | "split"; budget: Budget | null } {
  const own = budgets.find((b) => b.id === projectFundingBudgetId("byok", projectId));
  if (!own)
    return {
      mode: "single",
      budget: budgets.find((b) => b.id === projectBudgetId(projectId)) ?? null,
    };
  return {
    mode: "split",
    budget:
      funding === "byok"
        ? own
        : (budgets.find((b) => b.id === projectFundingBudgetId("platform", projectId)) ?? null),
  };
}
