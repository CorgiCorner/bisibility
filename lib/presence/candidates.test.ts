import { describe, expect, it } from "vitest";
import { orderInspectionCandidates } from "./candidates";
import { discoverSitemapCandidates } from "./sitemap-candidates";

const property = "https://example.com/";
const now = new Date("2026-10-24T12:00:00Z");

describe("bounded sitemap candidate discovery", () => {
  it("uses child sitemaps, records origins, deduplicates and excludes outside-property URLs", async () => {
    const fetched: string[] = [];
    const result = await discoverSitemapCandidates(
      property,
      [`${property}sitemap.xml`],
      async ({ url }) => {
        fetched.push(url);
        return {
          url,
          contentType: "application/xml",
          body: url.endsWith("sitemap.xml")
            ? `<sitemapindex><sitemap><loc>${property}child.xml</loc></sitemap></sitemapindex>`
            : `<urlset><url><loc>${property}a</loc></url><url><loc>${property}a</loc></url><url><loc>https://other.test/a</loc></url></urlset>`,
        };
      },
    );
    expect(result.complete).toBe(true);
    expect(result.parents.get(`${property}child.xml`)).toBe(`${property}sitemap.xml`);
    expect(result.childCounts.get(`${property}sitemap.xml`)).toBe(1);
    expect([...result.urls]).toEqual([[`${property}a`, `${property}child.xml`]]);
    expect(fetched).toHaveLength(2);
  });
  it("marks a bounded or failed discovery incomplete", async () => {
    const roots = Array.from({ length: 25 }, (_, i) => `${property}${i}.xml`);
    let fetched = 0;
    const result = await discoverSitemapCandidates(property, roots, async ({ url }) => {
      fetched++;
      return { url, body: "<urlset/>", contentType: "application/xml" };
    });
    expect(result.complete).toBe(false);
    expect(fetched).toBe(20);
    expect(
      (
        await discoverSitemapCandidates(property, roots.slice(0, 1), async () => {
          throw new Error("timeout");
        })
      ).complete,
    ).toBe(false);
  });
  it("prioritizes keyword targets, unchecked sitemap URLs, then oldest stored results", () => {
    const row = (path: string, source: string, checkedAt: Date | null) => ({
      url: property + path,
      source,
      checkedAt,
    });
    const rows = [
      row("old", "sitemap", new Date(0)),
      row("new", "sitemap", null),
      row("keyword", "keyword_target", new Date(10)),
      row("today", "keyword_target", now),
    ];
    expect(orderInspectionCandidates(rows, property, now).map((entry) => entry.url)).toEqual([
      `${property}keyword`,
      `${property}new`,
      `${property}old`,
    ]);
  });
});

it("cuts sitemap discovery at the shared run deadline", async () => {
  let time = 1000;
  const fetched: number[] = [];
  const result = await discoverSitemapCandidates(
    property,
    [property + "one.xml", property + "two.xml"],
    async ({ url, timeoutMs }) => {
      fetched.push(timeoutMs);
      time = 1050;
      return { url, contentType: "application/xml", body: "<urlset/>" };
    },
    { clock: () => time, runDeadline: 1050 },
  );
  expect(fetched).toEqual([50]);
  expect(result.complete).toBe(false);
});
it("does not reselect failures today and keeps never-inspected sitemaps ahead of old results", () => {
  const rows = [
    { url: property + "old", source: "sitemap", checkedAt: new Date(0) },
    {
      url: property + "never",
      source: "sitemap",
      checkedAt: null,
      inspectionFailedAt: new Date(0),
    },
    {
      url: property + "failed",
      source: "keyword_target",
      checkedAt: null,
      inspectionFailedAt: now,
    },
    {
      url: property + "failed-old-result",
      source: "sitemap",
      checkedAt: new Date(0),
      inspectionFailedAt: now,
    },
  ];
  expect(orderInspectionCandidates(rows, property, now).map((row) => row.url)).toEqual([
    property + "never",
    property + "old",
  ]);
});
