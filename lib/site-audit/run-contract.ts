import type { SiteAuditPage } from "./schema";

export type CrawlState =
  | "queued"
  | "running"
  | "paused"
  | "complete"
  | "stopped"
  | "failed"
  | "cancelled";
export type CrawlStopReason =
  | "finished"
  | "page_budget"
  | "monthly_pool"
  | "unverified_cap"
  | "time_limit"
  | "cancelled"
  | "error";
export type CrawlProgress = {
  state: CrawlState;
  pagesCrawled: number;
  stopReason: CrawlStopReason | null;
};
export type CrawlClaim = {
  id: string;
  projectId: string;
  target: string;
  token: string;
  requestedPages: number;
  budgetPages: number;
  priority: number;
  pagesCrawled: number;
};
export type FrontierEntry = { url: string; depth: number };
export type CrawlBudgetResolution = {
  maxPages: number;
  stopReason: CrawlStopReason;
  priority: number;
};

export async function capturedSiteAuditBudget(claim: CrawlClaim): Promise<CrawlBudgetResolution> {
  return { maxPages: claim.budgetPages, priority: claim.priority, stopReason: "page_budget" };
}
export type CrawlStore = {
  claim: (runId: string) => Promise<CrawlClaim | CrawlProgress>;
  release: (claim: CrawlClaim) => Promise<void>;
  limit: (claim: CrawlClaim, budget: CrawlBudgetResolution) => Promise<void>;
  next: (claim: CrawlClaim) => Promise<FrontierEntry | null>;
  save: (input: {
    claim: CrawlClaim;
    entry: FrontierEntry;
    page: SiteAuditPage;
    discovered: string[];
    requests: number;
  }) => Promise<boolean>;
  finish: (
    claim: CrawlClaim,
    reason: CrawlStopReason | "batch",
    requests: number,
  ) => Promise<CrawlProgress>;
};
