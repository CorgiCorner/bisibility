import { readFileSync } from "node:fs";
import { externalAgentReportSchema } from "@/lib/agent-reports/model";
import fixture from "@/plugins/bisibility/skills/seo-audit/references/example-report.json";
import {
  reportLink,
  safeSourceUrl,
  validateReport,
} from "@/plugins/bisibility/skills/seo-audit/scripts/validate-report.mjs";
import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";

const root = "plugins/bisibility/skills/seo-audit/";
const copy = () => structuredClone(fixture);

describe("installable SEO audit skill contract", () => {
  it("checks raw MCP title length and nested citation URL lists", () => {
    expect(() => validateReport({ ...copy(), title: `${" ".repeat(161)}x` })).toThrow("title");
    const payload = copy();
    Object.assign(payload.body.visibility, {
      observed: { citation_urls: ["javascript:alert(1)"] },
    });
    expect(() => validateReport(payload)).toThrow("Unsafe source URL list");
  });

  it("accepts its documented payload in both the helper and the real API schema", () => {
    const payload = validateReport(copy());
    const call = dispatchResearchWorkspaceTool("createAgentReport", payload);
    expect(externalAgentReportSchema.parse(call?.body)).toMatchObject({
      kind: "seo_audit",
      body: payload.body,
      provenance: payload.provenance,
    });
    expect(call).toMatchObject({
      method: "POST",
      path: `/projects/${fixture.project_id}/agent-reports`,
      idempotencyKey: fixture.idempotency_key,
    });
  });

  it("uses supported core and optional tool names with their real input contracts", () => {
    const definitions = getMcpToolDefinitions();
    const skill = readFileSync(`${root}SKILL.md`, "utf8");
    for (const name of [
      "list_projects",
      "get_project",
      "get_project_context",
      "run_site_audit",
      "get_site_audit",
      "list_site_audits",
      "list_keywords",
      "get_rank_history",
      "list_agent_reports",
      "get_agent_report",
      "create_agent_report",
      "list_search_performance_query_stats",
      "analyze_ai_visibility",
      "compare_ai_prompts",
    ]) {
      expect(skill).toContain(`\`${name}\``);
      expect(definitions.find((tool) => tool.name === name)).toBeDefined();
    }
    const crawl = definitions.find((tool) => tool.name === "run_site_audit");
    expect(crawl?.inputSchema.properties).toMatchObject({ max_pages: { maximum: 15 } });
    expect(crawl?.inputSchema.properties).not.toHaveProperty("url");
    const save = definitions.find((tool) => tool.name === "create_agent_report");
    expect(save?.inputSchema.additionalProperties).toBe(false);
    expect(Object.keys(save?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(Object.keys(fixture)),
    );
  });

  it("packages references and versions consistently with documented installation", () => {
    const skill = readFileSync(`${root}SKILL.md`, "utf8");
    for (const [, relative] of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
      expect(readFileSync(`${root}${relative}`, "utf8").length).toBeGreaterThan(0);
    }
    const manifest = JSON.parse(
      readFileSync("plugins/bisibility/.claude-plugin/plugin.json", "utf8"),
    );
    const market = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
    expect(manifest.version).toBe(fixture.provenance.skill_version);
    expect(market.version).toBe(manifest.version);
    expect(market.plugins[0].version).toBe(manifest.version);
    expect(readFileSync("plugins/bisibility/README.md", "utf8")).toContain("/bisibility:seo-audit");
    expect(readFileSync("docs/agents.mdx", "utf8")).toContain("$seo-audit");
  });

  it.each(["html", "summary", "reportId"])("rejects unsupported top-level field %s", (field) => {
    expect(() => validateReport({ ...copy(), [field]: "unsupported" })).toThrow("Unsupported");
  });

  it("rejects ungrounded actions and conflated synthetic visibility confidence", () => {
    const payload = copy();
    payload.body.recommendations[0].evidence_ids = ["invented"];
    expect(() => validateReport(payload)).toThrow("Dangling");
    const synthetic = copy();
    synthetic.body.evidence[0].type = "synthetic_prompt_test";
    synthetic.body.evidence[0].source_tool = "get_agent_report";
    synthetic.body.recommendations[0].category = "visibility";
    expect(() => validateReport(synthetic)).toThrow("observed data");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "https://user:pass@example.com",
  ])("rejects unsafe source URL %s", (url) => {
    expect(safeSourceUrl(url)).toBe(false);
    const payload = copy();
    payload.body.evidence[0].url = url;
    expect(() => validateReport(payload)).toThrow("Unsafe source");
  });

  it("permits unknown observation dates but rejects missing retrieval dates and reserved kinds", () => {
    const payload = copy();
    payload.body.evidence[0].observed_at = null as unknown as string;
    expect(() => validateReport(payload)).not.toThrow();
    payload.body.evidence[0].retrieved_at = "unknown";
    expect(() => validateReport(payload)).toThrow("retrieval");
    expect(() => validateReport({ ...copy(), kind: "site_audit" })).toThrow("seo_audit");
  });

  it("enforces real UTF-8 payload bounds and rejects non-JSON/deep values", () => {
    const payload = copy();
    payload.body.summary = "界".repeat(90_000);
    expect(() => validateReport(payload)).toThrow("byte limit");
    expect(
      externalAgentReportSchema.safeParse(
        dispatchResearchWorkspaceTool("createAgentReport", payload)?.body,
      ).success,
    ).toBe(false);
    const deep = copy();
    let value: Record<string, unknown> = {};
    deep.body.context = value as typeof deep.body.context;
    for (let i = 0; i < 18; i++) {
      value.child = {};
      value = value.child as Record<string, unknown>;
    }
    expect(() => validateReport(deep)).toThrow("depth");
    expect(() => validateReport({ ...copy(), provenance: { invalid: Number.NaN } })).toThrow(
      "Non-finite",
    );
  });

  it("constructs project-scoped access links from trusted origins and returned public IDs", () => {
    expect(
      reportLink("https://bisibility.com", fixture.project_id, "agr_c00000000000000000000000"),
    ).toBe(
      `https://bisibility.com/app/${fixture.project_id}/agent-reports/agr_c00000000000000000000000`,
    );
    for (const origin of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
    ]) {
      expect(() =>
        reportLink(origin, fixture.project_id, "agr_c00000000000000000000000"),
      ).toThrow();
    }
    expect(() =>
      reportLink("https://bisibility.com", fixture.project_id, "../../other-project"),
    ).toThrow();
  });
});
