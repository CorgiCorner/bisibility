import { describe, expect, it } from "vitest";
import { MAX_CHILD_SITEMAPS, MAX_SITEMAP_ENTRIES, parseSitemapXml } from "./parse";

function urlsetEntries(count: number) {
  return Array.from(
    { length: count },
    (_, index) => `<url><loc>https://example.com/page-${index}</loc></url>`,
  ).join("");
}

describe("parseSitemapXml", () => {
  it("parses urlset entries with optional lastmod values", () => {
    const parsed = parseSitemapXml(`
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/</loc>
          <lastmod>2026-07-01</lastmod>
        </url>
        <url><loc>https://example.com/pricing</loc></url>
      </urlset>
    `);

    expect(parsed).toMatchObject({
      entries: [
        { lastmod: "2026-07-01", loc: "https://example.com/" },
        { loc: "https://example.com/pricing" },
      ],
      kind: "urlset",
      truncated: false,
      urlCount: 2,
    });
  });

  it("returns capped child sitemap URLs for sitemap indexes", () => {
    const sitemaps = Array.from(
      { length: MAX_CHILD_SITEMAPS + 1 },
      (_, index) => `
        <sitemap>
          <loc>https://example.com/sitemap-${index}.xml</loc>
          <lastmod>2026-07-0${(index % 9) + 1}</lastmod>
        </sitemap>
      `,
    ).join("");

    const parsed = parseSitemapXml(`<sitemapindex>${sitemaps}</sitemapindex>`);

    expect(parsed.kind).toBe("sitemapindex");
    expect(parsed.childSitemapCount).toBe(MAX_CHILD_SITEMAPS + 1);
    expect(parsed.childSitemaps[0]).toEqual({
      lastmod: "2026-07-01",
      loc: "https://example.com/sitemap-0.xml",
    });
    expect(parsed.childSitemapUrls).toHaveLength(MAX_CHILD_SITEMAPS);
    expect(parsed.childSitemapUrls[0]).toBe("https://example.com/sitemap-0.xml");
    expect(parsed.truncated).toBe(true);
  });

  it("returns an empty unknown result for malformed or unsupported XML", () => {
    expect(parseSitemapXml("<urlset><url><loc>https://example.com").entries).toEqual([]);
    expect(parseSitemapXml("<rss><channel /></rss>")).toMatchObject({
      childSitemapUrls: [],
      entries: [],
      kind: "unknown",
      truncated: false,
      urlCount: 0,
    });
  });

  it("decodes XML entities in loc values", () => {
    const parsed = parseSitemapXml(`
      <urlset>
        <url><loc>https://example.com/search?q=rank&amp;sort=asc</loc></url>
        <url><loc>https://example.com/&#x70;&#97;&#103;&#101;</loc></url>
      </urlset>
    `);

    expect(parsed.entries).toEqual([
      { loc: "https://example.com/search?q=rank&sort=asc" },
      { loc: "https://example.com/page" },
    ]);
  });

  it("caps stored urlset entries and reports truncation", () => {
    const parsed = parseSitemapXml(`<urlset>${urlsetEntries(MAX_SITEMAP_ENTRIES + 2)}</urlset>`);

    expect(parsed.entries).toHaveLength(MAX_SITEMAP_ENTRIES);
    expect(parsed.truncated).toBe(true);
    expect(parsed.urlCount).toBe(MAX_SITEMAP_ENTRIES + 2);
  });
});
