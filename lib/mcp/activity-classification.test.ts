import { describe, expect, it } from "vitest";
import { isMcpMutation } from "./activity-classification";
import definitions from "./canonical-contract.json";
import type { McpToolDefinition } from "./types";

const tools = definitions as McpToolDefinition[];
describe("MCP activity classification", () => {
  it("requires explicit readOnlyHint metadata for every registered tool", () => {
    for (const tool of tools)
      expect(typeof tool.annotations.readOnlyHint, tool.name).toBe("boolean");
  });
  it("distinguishes mutations, reads by POST, and estimate-only requests", () => {
    const find = (name: string) => tools.find((tool) => tool.name === name);
    expect(isMcpMutation(find("create_project"), {})).toBe(true);
    expect(isMcpMutation(find("create_project"), { estimate_only: true })).toBe(true);
    expect(isMcpMutation(find("get_keyword_metrics"), {})).toBe(false);
    expect(isMcpMutation(find("research_keywords"), { estimate_only: true })).toBe(false);
    expect(isMcpMutation(undefined, {})).toBe(false);
  });
});
