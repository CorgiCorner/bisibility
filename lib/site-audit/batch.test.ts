import { crawlStoreFixture } from "@/tests/fixtures/site-audit/crawl-store";
import { describe, expect, it, vi } from "vitest";
import { crawlSiteAuditBatch } from "./batch";
import { capturedSiteAuditBudget } from "./run-contract";

function transport(includeDisallowed = false) {
  const calls: string[] = [];
  return {
    calls,
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    fetch: vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /private");
      const index = Number(url.pathname.slice(1)) || 0;
      return new Response(
        `<title>Page ${index}</title><h1>Page</h1>${index < 119 ? `<a href="/${index + 1}">Next</a>` : ""}${includeDisallowed && index === 0 ? '<a href="/private">Private</a>' : ""}`,
        { headers: { "content-type": "text/html" } },
      );
    }) as typeof fetch,
  };
}

describe("durable crawl batches", () => {
  it("keeps the captured page cap across batches even if the current resolver changes", async () => {
    const fixture = crawlStoreFixture();
    const io = transport();
    await crawlSiteAuditBatch("run", {
      store: fixture.store,
      budget: capturedSiteAuditBudget,
      transport: io,
      maxPages: 3,
    });
    fixture.setLimit(1);
    await crawlSiteAuditBatch("run", {
      store: fixture.store,
      budget: capturedSiteAuditBudget,
      transport: io,
      maxPages: 3,
    });
    expect(fixture.pages.size).toBe(6);
  });
  it("resumes a 120-page crawl after a crash without refetching committed pages", async () => {
    const fixture = crawlStoreFixture();
    const io = transport();
    fixture.crashAt(9);
    await expect(
      crawlSiteAuditBatch("run", { store: fixture.store, budget: fixture.budget, transport: io }),
    ).rejects.toThrow("Worker crashed");
    const completed = [...fixture.pages.keys()];
    const before = [...io.calls];
    fixture.crashAt(-1);
    for (let batch = 0; batch < 10; batch++) {
      const progress = await crawlSiteAuditBatch("run", {
        store: fixture.store,
        budget: fixture.budget,
        transport: io,
      });
      if (progress.state === "complete") break;
    }
    expect(fixture.pages.size).toBe(120);
    for (const url of completed)
      expect(io.calls.slice(before.length)).not.toContain(new URL(url).pathname);
    expect(io.calls).not.toContain("/private");
  });
  it("re-reads a reduced budget before the next batch and does no extra I/O", async () => {
    const fixture = crawlStoreFixture();
    const io = transport();
    await crawlSiteAuditBatch("run", {
      store: fixture.store,
      budget: fixture.budget,
      transport: io,
      maxPages: 3,
    });
    fixture.setLimit(3);
    const before = io.calls.length;
    expect(
      await crawlSiteAuditBatch("run", {
        store: fixture.store,
        budget: fixture.budget,
        transport: io,
      }),
    ).toMatchObject({ state: "stopped", stopReason: "page_budget", pagesCrawled: 3 });
    expect(io.calls).toHaveLength(before);
  });
  it("never fetches a cancelled run", async () => {
    const fixture = crawlStoreFixture();
    const io = transport();
    fixture.cancel();
    expect(
      await crawlSiteAuditBatch("run", {
        store: fixture.store,
        budget: fixture.budget,
        transport: io,
      }),
    ).toMatchObject({ state: "cancelled" });
    expect(io.calls).toEqual([]);
  });
  it.each([-1, NaN, 1.5])("rejects invalid budget %s before making a request", async (maxPages) => {
    const fixture = crawlStoreFixture();
    const io = transport();
    await expect(
      crawlSiteAuditBatch("run", {
        store: fixture.store,
        budget: async () => ({ maxPages, stopReason: "page_budget", priority: 0 }),
        transport: io,
      }),
    ).rejects.toThrow("Invalid site audit page budget");
    expect(io.calls).toEqual([]);
  });
  it("does not fetch a discovered URL forbidden by robots.txt", async () => {
    const fixture = crawlStoreFixture();
    const io = transport(true);
    await crawlSiteAuditBatch("run", {
      store: fixture.store,
      budget: fixture.budget,
      transport: io,
      maxPages: 3,
    });
    expect(io.calls).not.toContain("/private");
    expect(fixture.pages.get("https://example.com/private")?.issues[0]?.code).toBe(
      "robots_disallowed",
    );
  });
});
