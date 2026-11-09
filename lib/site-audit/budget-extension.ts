import type { Prisma } from "@/lib/generated/prisma/client";
import type { CrawlBudgetResolution, CrawlClaim } from "@/lib/site-audit/run-contract";

export { assertOperationAccess as assertSiteAuditOperationAccess } from "@/lib/operations/access-extension";

export async function resolveSiteAuditBudget(
  input: {
    projectId: string;
    target: string;
    requestedPages: number;
    resuming?: boolean;
    runId?: string;
  },
  _tx?: Prisma.TransactionClient,
): Promise<CrawlBudgetResolution> {
  return { maxPages: Math.min(input.requestedPages, 15), stopReason: "page_budget", priority: 0 };
}

export async function readSiteAuditPageLimit(_projectId: string) {
  return 15;
}

export async function lockSiteAuditAdmission(_tx: Prisma.TransactionClient, _projectId: string) {}

export async function rememberSiteAuditBudget(_tx: Prisma.TransactionClient, _runId: string) {}

export async function settleSiteAuditCrawl(_tx: Prisma.TransactionClient, _runId: string) {}

export async function readAdmittedCrawlBudget(claim: CrawlClaim): Promise<CrawlBudgetResolution> {
  return { maxPages: claim.budgetPages, priority: claim.priority, stopReason: "page_budget" };
}
