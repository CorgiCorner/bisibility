import "server-only";
import { getRequestPrimarySerpProvider } from "@/lib/queries/workspace-request-data";
import { formatQuantity, type Quantity } from "@usagekit/core";
import { projectBudgetCapCents, projectBudgetStatus } from "./project-budget-read";
import {
  connectionFunding,
  type ProjectFunding,
  parseProjectFundingBudgetId,
} from "./project-funding-budgets";
import { monthlySpendCents } from "./usage-read";

/** Rank checks spend from the primary SERP connection, so its source's project limit applies. */
async function rankCheckFunding(projectId: string) {
  return connectionFunding((await getRequestPrimarySerpProvider(projectId))?.credentialSource);
}

function quantityCents(quantity: Quantity | null | undefined) {
  return quantity ? Number(formatQuantity(quantity)) : 0;
}

export type RankCheckBudgetAmounts = {
  capCents: number;
  spentCents: number;
  reservedCents: number;
  split: boolean;
  /** The funding source has a project budget row. */
  present: boolean;
  uncertain: boolean;
  /** The row exists and its limit is set, including an explicit zero. */
  limited: boolean;
};

/**
 * Cap and spend for the rank-check funding source. Unsplit projects keep the combined
 * monthly total. Split projects use that source's own budget usage.
 */
export async function rankCheckBudgetAmounts(
  projectId: string,
  now = new Date(),
  /** Callers that already loaded the primary SERP connection pass its source. */
  funding?: ProjectFunding,
): Promise<RankCheckBudgetAmounts> {
  const status = await projectBudgetStatus(
    projectId,
    now,
    funding ?? (await rankCheckFunding(projectId)),
  );
  const budgetId = status?.budget.id;
  const split = typeof budgetId === "string" && parseProjectFundingBudgetId(budgetId) !== null;
  const limit = status?.budget.limit ?? null;
  return {
    capCents: limit ? Number(formatQuantity(limit)) : 0,
    spentCents: split ? quantityCents(status?.used) : await monthlySpendCents(projectId, now),
    reservedCents: quantityCents(status?.reserved),
    split,
    present: status !== null,
    uncertain: status?.uncertain === true,
    limited: status !== null && limit !== null,
  };
}

export async function rankCheckBudgetStatus(projectId: string, now = new Date()) {
  return projectBudgetStatus(projectId, now, await rankCheckFunding(projectId));
}

export async function rankCheckBudgetCapCents(projectId: string) {
  return projectBudgetCapCents(projectId, await rankCheckFunding(projectId));
}
