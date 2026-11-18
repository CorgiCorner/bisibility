import { makePublicId } from "@/lib/db/public-id-resources";
import canonicalTools from "@/lib/mcp/canonical-contract.json";
import { PHASE_C_PENDING_TOOL_NAMES } from "@/lib/mcp/canonical-tools";
import { mcpToolRestCall } from "@/lib/mcp/tools";
import { expect, test } from "vitest";
import {
  ASSISTANT_TOOL_POLICY,
  assistantToolHasCostCeiling,
  EXCLUDED_ASSISTANT_TOOLS,
  findAssistantTool,
} from "./tool-policy";

test("each canonical tool has exactly one policy and exclusions are explicit", () => {
  expect(canonicalTools).toHaveLength(148);
  expect(ASSISTANT_TOOL_POLICY).toHaveLength(canonicalTools.length);
  expect(new Set(ASSISTANT_TOOL_POLICY.map((entry) => entry.tool.name)).size).toBe(148);
  for (const entry of ASSISTANT_TOOL_POLICY) {
    expect(["read", "paid", "mutation", "destructive", "excluded"]).toContain(entry.category);
    if (entry.category === "excluded") expect(EXCLUDED_ASSISTANT_TOOLS).toContain(entry.tool.name);
  }
  for (const name of PHASE_C_PENDING_TOOL_NAMES) expect(EXCLUDED_ASSISTANT_TOOLS).toContain(name);
});
test("paid, mutations, destructive tools and sensitive routes remain distinct", () => {
  for (const name of ["run_rank_check", "research_keywords", "compare_ai_prompts"])
    expect(findAssistantTool(name)?.category).toBe("paid");
  // Paid work without a schema-level ceiling stays in the native UI.
  for (const name of [
    "run_site_audit",
    "create_prompt_tracker_run",
    "prompt_research_suggestions_generate",
  ])
    expect(findAssistantTool(name)?.category).toBe("excluded");
  // Free external syncs still need approval but never carry a cost ceiling.
  for (const name of ["sync_project_traffic", "inspect_search_index_urls"])
    expect(findAssistantTool(name)?.category).toBe("mutation");
  expect(findAssistantTool("estimate_keyword_research_cost")?.category).toBe("read");
  expect(findAssistantTool("list_keywords")?.category).toBe("read");
  expect(findAssistantTool("get_search_performance_totals")?.category).toBe("read");
  expect(findAssistantTool("add_keywords")?.category).toBe("mutation");
  expect(findAssistantTool("bulk_update_keywords")?.category).toBe("destructive");
  expect(findAssistantTool("create_api_key")?.category).toBe("excluded");
});

test("every paid tool with a cost ceiling forwards it to its REST operation", () => {
  for (const entry of ASSISTANT_TOOL_POLICY) {
    if (entry.category !== "paid") continue;
    expect(assistantToolHasCostCeiling(entry.tool), entry.tool.name).toBe(true);
    const rest = mcpToolRestCall(entry.tool.name, {
      project_id: makePublicId("prj"),
      max_cost_cents: 123,
      keywords: ["example"],
      keyword: "example",
      target: "example.com",
      domain: "example.com",
      seed: "example",
      prompts: ["example"],
      snapshot_ref: "snapshot-ref",
      keyword_id: makePublicId("kw"),
    });
    const query = new URL(`https://assistant.local${rest.path}`).searchParams.get("max_cost_cents");
    const body =
      rest.body && typeof rest.body === "object" ? Reflect.get(rest.body, "max_cost_cents") : null;
    expect([String(query), String(body)], entry.tool.name).toContain("123");
  }
});

test.each(["create_prompt_tracker_schedule", "update_prompt_tracker_schedule"])(
  "keeps the deprecated AI schedule write %s out of the assistant",
  (name) => {
    expect(EXCLUDED_ASSISTANT_TOOLS).toContain(name);
    expect(findAssistantTool(name)?.category).toBe("excluded");
  },
);
