import { describe, expect, it } from "vitest";
import { observeProjectPages } from "./observations";

const now = new Date("2026-11-10T04:00:00.000Z");
const earlier = new Date("2026-10-01T00:00:00.000Z");
const later = new Date("2026-11-01T00:00:00.000Z");

function observe(overrides: Partial<Parameters<typeof observeProjectPages>[0]> = {}) {
  return observeProjectPages({
    citations: [],
    domain: "example.com",
    keywords: [],
    manual: [],
    now,
    presences: [],
    searchPages: [],
    snapshots: [],
    ...overrides,
  });
}

function pageAt(observed: ReturnType<typeof observe>, path: string) {
  const page = observed.pages.find((candidate) => candidate.path === path);
  if (!page) throw new Error(`Missing ${path}`);
  return page;
}

function source(page: ReturnType<typeof observe>["pages"][number], kind: string) {
  return page.sources.find((stamp) => stamp.source === kind);
}

describe("observeProjectPages", () => {
  it("keeps one page per normalized path and records each source", () => {
    const observed = observe({
      citations: [
        {
          firstSeenAt: earlier,
          lastSeenAt: later,
          url: "https://www.example.com/pricing/#section",
        },
      ],
      keywords: [
        {
          checkedAt: later,
          createdAt: earlier,
          expectedUrl: "https://example.com/pricing/",
          targetUrl: "https://example.com/pricing",
        },
      ],
      searchPages: [
        {
          firstSeenAt: earlier,
          lastSeenAt: later,
          page: "http://EXAMPLE.com/pricing",
        },
      ],
      snapshots: [
        {
          entries: [{ loc: "https://example.com/pricing/" }, { loc: "https://other.example/nope" }],
          fetchedAt: later,
          sitemapUrl: "https://example.com/sitemap.xml",
        },
      ],
    });

    expect(observed.pages.map((page) => page.path)).toEqual(["/pricing"]);
    expect(observed.truncated).toBe(false);
    const page = observed.pages[0];
    if (!page) throw new Error("Missing page");
    expect(page.sources.map((stamp) => stamp.source)).toEqual([
      "ai_citation",
      "rank_tracker",
      "search_console",
      "sitemap",
    ]);
    expect(source(page, "sitemap")?.detail).toEqual({
      listed: true,
      sitemapUrls: ["https://example.com/sitemap.xml"],
    });
    expect(source(page, "rank_tracker")?.lastSeenAt).toEqual(now);
    expect(source(page, "search_console")?.firstSeenAt).toEqual(earlier);
  });

  it("keeps a URL that left the sitemap without advancing its last seen time", () => {
    const observed = observe({
      presences: [
        {
          createdAt: earlier,
          lastListedAt: earlier,
          url: "https://example.com/old/",
        },
      ],
      snapshots: [
        {
          entries: [{ loc: "https://example.com/live" }],
          fetchedAt: later,
          sitemapUrl: "https://example.com/sitemap.xml",
        },
      ],
    });

    const old = pageAt(observed, "/old");
    expect(source(old, "sitemap")).toMatchObject({
      detail: { listed: false },
      firstSeenAt: earlier,
      lastSeenAt: earlier,
    });
    expect(source(pageAt(observed, "/live"), "sitemap")?.detail).toEqual({
      listed: true,
      sitemapUrls: ["https://example.com/sitemap.xml"],
    });
  });

  it("does not create a page for another host", () => {
    const observed = observe({
      citations: [{ firstSeenAt: now, lastSeenAt: now, url: "https://other.example/cited" }],
      keywords: [
        {
          checkedAt: now,
          createdAt: earlier,
          expectedUrl: "https://example.org/expected",
          targetUrl: "https://blog.example.com/target",
        },
      ],
      searchPages: [{ firstSeenAt: earlier, lastSeenAt: later, page: "https://example.org/gsc" }],
    });
    expect(observed.pages).toEqual([]);
  });

  it("is unchanged when the same observations are folded twice", () => {
    const input = {
      citations: [{ firstSeenAt: earlier, lastSeenAt: later, url: "https://example.com/a" }],
      domain: "example.com",
      keywords: [
        {
          checkedAt: later,
          createdAt: earlier,
          expectedUrl: null,
          targetUrl: "https://example.com/a",
        },
      ],
      manual: [
        {
          detail: { addedBy: "user_1" },
          firstSeenAt: earlier,
          lastSeenAt: earlier,
          path: "/manual",
        },
      ],
      now,
      presences: [],
      searchPages: [],
      snapshots: [
        {
          entries: [{ loc: "https://example.com/a" }],
          fetchedAt: later,
          sitemapUrl: "https://example.com/sitemap.xml",
        },
      ],
    };
    expect(observe(input)).toEqual(observe(input));
  });

  it("records truncation past the per-sync page cap", () => {
    const searchPages = Array.from({ length: 50_001 }, (_, index) => ({
      firstSeenAt: earlier,
      lastSeenAt: later,
      page: `/p-${String(index).padStart(5, "0")}`,
    }));
    const observed = observe({ searchPages });
    expect(observed.pages).toHaveLength(50_000);
    expect(observed.truncated).toBe(true);
    expect(observed.omitted).toBe(1);
    expect(observed.pages[0]?.path).toBe("/p-00000");
  }, 20_000);

  it("keeps a historical expected URL separate from the current target", () => {
    const observed = observe({
      keywords: [
        {
          checkedAt: earlier,
          createdAt: earlier,
          expectedUrl: "https://example.com/old-target",
          targetUrl: "https://example.com/new-target",
        },
      ],
    });
    const old = pageAt(observed, "/old-target");
    const current = pageAt(observed, "/new-target");
    expect(source(old, "rank_tracker")?.lastSeenAt).toEqual(earlier);
    expect(source(current, "rank_tracker")?.lastSeenAt).toEqual(now);
  });
});
