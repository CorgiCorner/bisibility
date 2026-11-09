import { failedPage } from "./crawl";
import { auditFailureMessage } from "./failure";
import {
  AuditRobotsDisallowedError,
  type AuditTransport,
  type CrawlBudget,
  fetchAuditPage,
} from "./fetch";
import { inspectHtml } from "./html";
import { auditRobotsPolicy } from "./robots";
import type { CrawlBudgetResolution, CrawlClaim, CrawlStore } from "./run-contract";
import type { SiteAuditPage } from "./schema";

type Options = {
  store: CrawlStore;
  budget: (input: CrawlClaim) => Promise<CrawlBudgetResolution>;
  transport?: AuditTransport;
  maxPages?: number;
  maxMs?: number;
  signal?: AbortSignal;
  heartbeat?: (pages: number) => void;
};

export async function crawlSiteAuditBatch(runId: string, options: Options) {
  const claim = await options.store.claim(runId);
  if (!("token" in claim)) return claim;
  try {
    return await crawlClaimedBatch(claim, options);
  } catch (error) {
    try {
      await options.store.release(claim);
    } catch (releaseError) {
      throw new AggregateError(
        [error, releaseError],
        "Site audit failed and lease release failed.",
      );
    }
    throw error;
  }
}

async function crawlClaimedBatch(claim: CrawlClaim, options: Options) {
  const resolution = await options.budget(claim);
  if (!Number.isSafeInteger(resolution.maxPages) || resolution.maxPages < 0)
    throw new Error("Invalid site audit page budget.");
  await options.store.limit(claim, resolution);
  let entry = await options.store.next(claim);
  if (!entry) return options.store.finish(claim, "finished", 0);
  if (claim.pagesCrawled >= resolution.maxPages)
    return options.store.finish(claim, resolution.stopReason, 0);
  const transport = options.transport ?? {};
  const now = transport.now ?? Date.now;
  const maxMs = Math.max(1, Math.min(options.maxMs ?? 60_000, 60_000));
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 50, 50));
  const budget: CrawlBudget = {
    deadline: now() + maxMs,
    origin: new URL(claim.target).origin,
    requests: 0,
    maxRequests: maxPages * 5 + 10,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(maxMs)])
      : AbortSignal.timeout(maxMs),
  };
  const robots = auditRobotsPolicy(new URL(claim.target), budget, transport, []);
  budget.disallowed = robots.disallowed;
  await robots.load(budget.origin);
  if (options.signal?.aborted) throw new Error("Audit activity cancelled.");
  if (robots.unavailable()) return options.store.finish(claim, "error", budget.requests);
  let pages = claim.pagesCrawled;
  let saved = 0;
  let accounted = 0;
  while (entry && pages < resolution.maxPages && saved < maxPages && now() < budget.deadline) {
    let page: SiteAuditPage;
    let discovered: string[] = [];
    try {
      const fetched = await fetchAuditPage(new URL(entry.url), budget, transport);
      const inspected = inspectHtml(fetched, entry.url);
      page = inspected.page;
      discovered = inspected.discovered;
    } catch (error) {
      if (options.signal?.aborted || now() >= budget.deadline) break;
      page = failedPage(entry.url, auditFailureMessage(error));
      if (error instanceof AuditRobotsDisallowedError) {
        page.finalUrl = error.url;
        page.issues = [{ code: "robots_disallowed", severity: "info", message: error.message }];
      }
    }
    if (options.signal?.aborted) throw new Error("Audit activity cancelled.");
    const persisted = await options.store.save({
      claim,
      entry,
      page,
      discovered,
      requests: budget.requests - accounted,
    });
    accounted = budget.requests;
    if (!persisted) return options.store.finish(claim, "batch", 0);
    pages++;
    saved++;
    options.heartbeat?.(pages);
    entry = await options.store.next(claim);
  }
  const remainingRequests = budget.requests - accounted;
  if (!entry) return options.store.finish(claim, "finished", remainingRequests);
  if (pages >= resolution.maxPages)
    return options.store.finish(claim, resolution.stopReason, remainingRequests);
  return options.store.finish(claim, "batch", remainingRequests);
}
