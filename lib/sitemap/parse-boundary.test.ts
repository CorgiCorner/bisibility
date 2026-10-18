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

  it.each([
    "<urlset><!<!-- ignored -->--><url><loc>https://example.com/ghost</loc></url>--></urlset>",
    "<urlset><ur<!-- ignored -->l><loc>https://example.com/ghost</loc></url></urlset>",
    "<urlset><ur<?instruction?>l><loc>https://example.com/ghost</loc></url></urlset>",
    "<urlset><url><loc>https://example.com/live</loc></url><broken></urlset>",
    "<urlset><url><loc>https://example.com/&unknown;</loc></url></urlset>",
  ])("rejects malformed XML instead of manufacturing entries: %s", (xml) => {
    expect(parseSitemapXml(xml)).toMatchObject({ kind: "unknown", entries: [], urlCount: 0 });
  });

  it("reads only direct entries and fields in the sitemap namespace", () => {
    const xml =
      '<s:urlset xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:x="https://example.org/extension"><x:url><x:loc>https://example.com/extension</x:loc></x:url><x:wrapper><s:url><s:loc>https://example.com/nested</s:loc></s:url></x:wrapper><s:url><x:loc>https://example.com/wrong-field</x:loc><s:loc>https://example.com/live</s:loc><s:lastmod>2026-10-12</s:lastmod></s:url></s:urlset>';
    expect(parseSitemapXml(xml)).toMatchObject({
      kind: "urlset",
      entries: [{ loc: "https://example.com/live", lastmod: "2026-10-12" }],
      urlCount: 1,
    });
  });

  it.each([
    '<x:urlset xmlns:x="urn:unrelated-feed"/>',
    '<x:urlset xmlns:x="urn:unrelated-feed"><x:url><x:loc>https://example.com/live</x:loc></x:url></x:urlset>',
  ])("rejects an unrelated root namespace: %s", (xml) => {
    expect(parseSitemapXml(xml)).toMatchObject({ kind: "unknown", entries: [], urlCount: 0 });
  });

  it("combines XML text and CDATA without reinterpreting their contents", () => {
    const xml =
      "<urlset><url><loc>https://example.com/<![CDATA[page?a=1&amp;b=2]]>&amp;c=3</loc></url></urlset>";
    expect(parseSitemapXml(xml).entries).toEqual([
      { loc: "https://example.com/page?a=1&amp;b=2&c=3" },
    ]);
  });

  it.each([
    '<!DOCTYPE urlset SYSTEM "https://example.com/external.dtd"><urlset/>',
    '<!DOCTYPE urlset [<!ENTITY link "https://example.com/expanded">]><urlset><url><loc>&link;</loc></url></urlset>',
  ])("rejects document types without expanding entities: %s", (xml) => {
    expect(parseSitemapXml(xml)).toMatchObject({ kind: "unknown", entries: [] });
  });

  it("rejects excessive nesting instead of retaining an unbounded XML stack", () => {
    const xml = `<urlset>${"<nested>".repeat(100)}${"</nested>".repeat(100)}</urlset>`;
    expect(parseSitemapXml(xml)).toMatchObject({ kind: "unknown", entries: [] });
  });
});
