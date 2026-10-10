import { describe, expect, it } from "vitest";
import { parseSitemapXml } from "./parse";

describe("sitemap XML document boundaries", () => {
  it("ignores commented obsolete entries", () => {
    expect(
      parseSitemapXml(
        "<urlset><!-- <url><loc>https://example.com/old</loc></url> --><url><loc>https://example.com/live</loc></url></urlset>",
      ).entries,
    ).toEqual([{ loc: "https://example.com/live" }]);
  });
  it("identifies the actual root after a commented sitemap index", () => {
    const parsed = parseSitemapXml(
      '<?xml version="1.0"?><!-- <sitemapindex><sitemap><loc>https://example.com/old.xml</loc></sitemap></sitemapindex> --><urlset><url><loc>https://example.com/live</loc></url></urlset>',
    );
    expect(parsed).toMatchObject({
      kind: "urlset",
      entries: [{ loc: "https://example.com/live" }],
      childSitemapUrls: [],
    });
  });
  it("does not mistake a nested sitemap element for the document root", () => {
    expect(
      parseSitemapXml(
        "<feed><urlset><url><loc>https://example.com/live</loc></url></urlset></feed>",
      ).kind,
    ).toBe("unknown");
  });
  it("preserves CDATA text rather than interpreting its markup", () => {
    expect(
      parseSitemapXml(
        "<urlset><url><loc><![CDATA[https://example.com/page?a=1&b=2]]></loc></url></urlset>",
      ).entries,
    ).toEqual([{ loc: "https://example.com/page?a=1&b=2" }]);
  });
  it("ignores entry-looking text within CDATA", () => {
    expect(
      parseSitemapXml(
        "<urlset><![CDATA[<url><loc>https://example.com/fake</loc></url>]]><url><loc>https://example.com/live</loc></url></urlset>",
      ).entries,
    ).toEqual([{ loc: "https://example.com/live" }]);
  });
  it("preserves literal entity-looking text within CDATA", () => {
    expect(
      parseSitemapXml(
        "<urlset><url><loc><![CDATA[https://example.com/?a=1&amp;b=2]]></loc></url></urlset>",
      ).entries,
    ).toEqual([{ loc: "https://example.com/?a=1&amp;b=2" }]);
  });
  it("accepts an empty self-closing sitemap root", () => {
    expect(
      parseSitemapXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" />'),
    ).toMatchObject({ kind: "urlset", entries: [] });
  });

  it("accepts processing instructions around a valid root", () => {
    expect(
      parseSitemapXml(
        '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="sitemap.xsl"?><urlset><url><loc>https://example.com/live</loc></url></urlset><?instruction done?>',
      ),
    ).toMatchObject({ kind: "urlset", entries: [{ loc: "https://example.com/live" }] });
  });
});
