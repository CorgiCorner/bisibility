import { expect, test } from "vitest";
import { discoverAssistantTools } from "./tool-discovery";
import { findAssistantTool } from "./tool-policy";

test("discovery bounds schemas, includes core reads and never offers excluded tools", () => {
  const tools = discoverAssistantTools(
    "keywords rankings research backlinks alerts competitors AI visibility site audit indexing traffic reports saved views",
    "/project",
  );
  expect(tools.length).toBeLessThanOrEqual(24);
  expect(JSON.stringify(tools).length).toBeLessThan(25000);
  expect(tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["get_project", "list_keywords", "select_tool_groups"]),
  );
  for (const tool of tools)
    if (tool.name !== "select_tool_groups")
      expect(findAssistantTool(tool.name)?.category).not.toBe("excluded");
});
test("requested groups add their relevant tools on the next step", () => {
  expect(discoverAssistantTools("hello", "/", ["site_audit"]).map((tool) => tool.name)).toContain(
    "list_site_audits",
  );
  // Starting an audit has no schema cost ceiling, so it stays excluded even when requested.
  expect(
    discoverAssistantTools("hello", "/", ["site_audit"]).map((tool) => tool.name),
  ).not.toContain("run_site_audit");
});
test("a read-only role is offered read tools only", () => {
  const tools = discoverAssistantTools(
    "add keywords delete alerts rankings research site audit saved views",
    "/project",
    ["keywords", "alerts", "saved_views"],
    true,
  );
  const named = tools.filter((tool) => tool.name !== "select_tool_groups");
  expect(named.length).toBeGreaterThan(0);
  for (const tool of named) expect(findAssistantTool(tool.name)?.category).toBe("read");
  const writable = discoverAssistantTools("add keywords delete alerts", "/project", [
    "keywords",
    "alerts",
  ]);
  expect(writable.some((tool) => findAssistantTool(tool.name)?.category !== "read")).toBe(true);
});
