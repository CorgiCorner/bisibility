import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { pageIndexingDescriptions, pageIndexingToolSchemas } from "./page-indexing-contract";

describe("stored Page indexing contract", () => {
  it("serves maintained schemas and marks only settings updates writable", () => {
    const definitions = getMcpToolDefinitions();
    for (const [id, name] of [
      ["getPageIndexingReport", "get_page_indexing_report"],
      ["listPageIndexingUrls", "list_page_indexing_urls"],
      ["getPageIndexingSettings", "get_page_indexing_settings"],
      ["updatePageIndexingSettings", "update_page_indexing_settings"],
    ] as const) {
      const tool = definitions.find((entry) => entry.name === name);
      expect(tool?.description).toBe(pageIndexingDescriptions[id]);
      expect(tool?.inputSchema).toEqual(pageIndexingToolSchemas[id]);
      expect(tool?.annotations.readOnlyHint).toBe(id !== "updatePageIndexingSettings");
    }
  });
});
