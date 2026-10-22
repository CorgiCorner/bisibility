import { getOpenApiDocument } from "@/lib/api/openapi";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { keywordResearchMcpSchemas } from "./keyword-research-schemas";

vi.mock("server-only", () => ({}));

const paidTools = [
  "analyze_backlinks",
  "load_more_backlink_rows",
  "research_keywords",
  "get_keyword_metrics",
  "list_ranked_keyword_suggestions",
  "run_rank_check",
  "analyze_ai_visibility",
  "compare_ai_prompts",
  "analyze_domain_overview",
  "load_domain_overview_history",
  "load_domain_overview_keywords",
  "load_domain_overview_pages",
];

describe("zero-cost discovery contract", () => {
  let tools: ReturnType<typeof getMcpToolDefinitions>;
  beforeAll(() => {
    tools = getMcpToolDefinitions();
  });
  it.each(paidTools)("%s advertises a nonnegative cost cap", (name) => {
    const tool = tools.find((item) => item.name === name);
    const properties = tool?.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(properties.max_cost_cents).toMatchObject({ minimum: 0, type: "integer" });
    expect(properties.max_cost_cents).not.toHaveProperty("exclusiveMinimum");
    expect(properties.max_cost_cents.description).toMatch(/cach/i);
    if (!name.includes("domain_overview"))
      expect(tool?.description).toContain("0 = cached result only");
  });
  it.each(Object.values(keywordResearchMcpSchemas))(
    "keeps local research schemas nonnegative",
    (schema) => {
      expect(schema.properties.max_cost_cents.minimum).toBe(0);
    },
  );
  it("keeps every priced OpenAPI cost cap nonnegative", () => {
    for (const item of Object.values(getOpenApiDocument().paths)) {
      for (const operation of Object.values(item)) {
        const cost = (operation as Record<string, unknown>)["x-bisibility-cost"] as
          | { max_cost_cents?: { minimum: number } }
          | undefined;
        if (cost?.max_cost_cents) expect(cost.max_cost_cents.minimum).toBe(0);
      }
    }
  });
});
