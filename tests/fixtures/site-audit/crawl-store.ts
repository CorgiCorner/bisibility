import type { CrawlClaim, CrawlProgress, CrawlStore } from "@/lib/site-audit/run-contract";
import type { SiteAuditPage } from "@/lib/site-audit/schema";

export function crawlStoreFixture() {
  const pages = new Map<string, SiteAuditPage>();
  const frontier = new Map([["https://example.com/", { url: "https://example.com/", depth: 0 }]]);
  let state: CrawlProgress["state"] = "queued";
  let limit = 120;
  let epoch = 0;
  let crashAt = -1;
  const progress = (): CrawlProgress => ({ state, pagesCrawled: pages.size, stopReason: null });
  const store: CrawlStore = {
    claim: async () => {
      if (state === "cancelled") return progress();
      state = "running";
      return {
        id: "run",
        projectId: "project",
        target: "https://example.com/",
        token: String(++epoch),
        requestedPages: 120,
        budgetPages: 120,
        priority: 0,
        pagesCrawled: pages.size,
      };
    },
    release: async () => undefined,
    limit: async () => undefined,
    next: async () => frontier.values().next().value ?? null,
    save: async ({ entry, page, discovered }) => {
      if (pages.size === crashAt) throw new Error("Worker crashed");
      if (state === "cancelled") return false;
      pages.set(entry.url, page);
      frontier.delete(entry.url);
      for (const url of discovered)
        if (!pages.has(url)) frontier.set(url, { url, depth: entry.depth + 1 });
      return true;
    },
    finish: async (_claim: CrawlClaim, reason) => {
      if (state !== "cancelled")
        state = reason === "finished" ? "complete" : reason === "batch" ? "running" : "stopped";
      return { ...progress(), stopReason: reason === "batch" ? null : reason };
    },
  };
  return {
    store,
    pages,
    frontier,
    budget: async () => ({ maxPages: limit, stopReason: "page_budget" as const, priority: 0 }),
    setLimit: (value: number) => {
      limit = value;
    },
    crashAt: (value: number) => {
      crashAt = value;
    },
    cancel: () => {
      state = "cancelled";
    },
  };
}
