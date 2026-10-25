import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { searchIndexDescriptions, searchIndexToolSchemas } from "./search-index-contract";

describe("Page indexing canonical contract", () => {
  it("keeps the maintained descriptions and schemas identical to the served contract", () => {
    const definitions = getMcpToolDefinitions();
    for (const [id, name] of [
      ["listSearchIndexSitemaps", "list_search_index_sitemaps"],
      ["getSearchIndexSitemap", "get_search_index_sitemap"],
      ["inspectSearchIndexUrls", "inspect_search_index_urls"],
    ] as const) {
      const definition = definitions.find((tool) => tool.name === name);
      expect(definition?.description).toBe(searchIndexDescriptions[id]);
      expect(definition?.inputSchema).toEqual(searchIndexToolSchemas[id]);
    }
  });
});
