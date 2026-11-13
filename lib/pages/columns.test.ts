import { describe, expect, it } from "vitest";
import { type PageColumnFacts, projectPageColumnSources } from "./columns";

const facts: PageColumnFacts = {
  aiCitations: 4,
  aiPages: 2,
  checked: 3,
  ga4Pages: 9,
  keywords: 6,
  listed: 5,
  monthsStored: 8,
  plausiblePages: 7,
  presenceTotal: 10,
  prompts: 3,
  rankPages: 4,
  searchConsolePages: 11,
};

describe("projectPageColumnSources", () => {
  it("derives column states from the connections the existing screens use", () => {
    const sources = projectPageColumnSources(facts, {
      aiConnected: true,
      ga4Connected: false,
      gscConnected: true,
      pagespeedConnected: true,
      plausibleConnected: true,
      rankConnected: true,
      sitemapEnabled: true,
    });
    expect(sources.map((source) => [source.kind, source.state, source.note])).toEqual([
      ["sitemap", "connected", ""],
      ["page_indexing", "beta", "3 checked of 10"],
      ["search_console", "connected", "8 months stored"],
      ["pagespeed", "connected", ""],
      ["analytics", "connected", "Plausible"],
      ["rank_tracker", "connected", "4 target URLs, 6 keywords"],
      ["ai_visibility", "connected", "3 prompts, 4 citations"],
    ]);
  });

  it("prefers GA4 over plausible and leaves disconnected metrics unconnected", () => {
    const sources = projectPageColumnSources(facts, {
      aiConnected: false,
      ga4Connected: true,
      gscConnected: false,
      pagespeedConnected: false,
      plausibleConnected: true,
      rankConnected: false,
      sitemapEnabled: false,
    });
    expect(sources.find((source) => source.kind === "analytics")).toMatchObject({
      note: "GA4",
      pages: 9,
      state: "connected",
    });
    expect(sources.find((source) => source.kind === "page_indexing")?.state).toBe("not_connected");
    expect(sources.find((source) => source.kind === "search_console")?.state).toBe("not_connected");
  });
});
