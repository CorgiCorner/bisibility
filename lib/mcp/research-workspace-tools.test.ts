import { researchWorkspaceOperationPolicy } from "@/lib/api/research-workspace-policy";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { researchWorkspaceToolNames } from "./research-workspace-contract";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";

const project = "prj_a00000000000000000000000";
const report = "agr_a00000000000000000000000";
afterEach(() => vi.unstubAllGlobals());

describe("research workspace MCP/REST contract", () => {
  it.each(Object.entries(researchWorkspaceOperationPolicy))(
    "dispatches %s through its exact REST policy",
    (name, policy) => {
      const dispatched = dispatchResearchWorkspaceTool(name, {
        project_id: project,
        report_id: report,
      });
      expect(dispatched).toMatchObject({
        method: policy.method,
        projectId: project,
        path: policy.path.replace("{project_id}", project).replace("{report_id}", report),
      });
    },
  );

  it("forwards opaque analysis JSON and strips transport fields", () => {
    const body = { BusinessName: "Example", result: { sourceURL: "https://example.com" } };
    const dispatched = dispatchResearchWorkspaceTool("createAgentReport", {
      project_id: project,
      kind: "analysis",
      title: "Saved analysis",
      body,
      idempotency_key: "stable-create-1",
    });
    expect(dispatched).toMatchObject({
      body: { body, kind: "analysis", title: "Saved analysis" },
      idempotencyKey: "stable-create-1",
    });
    expect(dispatched?.body).not.toHaveProperty("project_id");
    expect(dispatched?.body).not.toHaveProperty("idempotency_key");
  });

  it("encodes report pagination filters without a request body", () => {
    expect(
      dispatchResearchWorkspaceTool("listAgentReports", {
        project_id: project,
        kind: "site_audit",
        cursor: "opaque+cursor",
        limit: 20,
      }),
    ).toMatchObject({
      path: `/projects/${project}/agent-reports?kind=site_audit&limit=20&cursor=opaque%2Bcursor`,
      body: undefined,
    });
  });

  it("publishes cost controls and separates observed data from synthetic tests", () => {
    const definitions = getMcpToolDefinitions();
    for (const name of ["analyze_ai_visibility", "compare_ai_prompts"]) {
      const tool = definitions.find((item) => item.name === name);
      if (name === "analyze_ai_visibility")
        expect(tool?.inputSchema.required).toContain("max_cost_cents");
      else expect(tool?.inputSchema.required).not.toContain("max_cost_cents");
      expect(tool?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    }
    expect(definitions.find((tool) => tool.name === "compare_ai_prompts")?.description).toContain(
      "not observed",
    );
    for (const name of Object.values(researchWorkspaceToolNames))
      expect(definitions.find((tool) => tool.name === name)).toBeDefined();
  });

  it("validates legacy caps and explicit actual-cost consent without provider I/O", () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    const tool = getMcpToolDefinitions().find((item) => item.name === "compare_ai_prompts");
    if (!tool) throw new Error("Missing prompt comparison tool");
    const validate = new AjvJsonSchemaValidator().getValidator(tool.inputSchema as never);
    const base = { project_id: project, brand: "Acme", domain: "acme.com", prompt: "Which tools?" };
    const actual = {
      ...base,
      cost_policy: "provider_actual_cost",
      actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
      estimated_cost_limit_cents: 20,
      estimate_only: true,
    };
    const execution = {
      ...actual,
      estimate_only: false,
      idempotency_key: "12345678-1234-4234-8234-123456789012",
      estimate_credentials_ref: "a".repeat(64),
    };
    for (const valid of [
      { ...base, max_cost_cents: 0 },
      { ...base, max_cost_cents: 60, cost_policy: "hard_cap" },
      { ...base, max_cost_cents: 60, idempotency_key: "stable-legacy-request" },
      actual,
      execution,
    ])
      expect(validate(valid).valid).toBe(true);
    for (const invalid of [
      base,
      { ...base, cost_policy: "hard_cap" },
      { ...base, max_cost_cents: 60, actual_cost_acknowledgement: "non_guaranteed_estimate_v1" },
      { ...actual, actual_cost_acknowledgement: undefined },
      { ...actual, actual_cost_acknowledgement: "unversioned" },
      { ...actual, estimated_cost_limit_cents: undefined },
      { ...actual, estimated_cost_limit_cents: -1 },
      { ...actual, max_cost_cents: 60 },
      { ...execution, idempotency_key: undefined },
      { ...execution, idempotency_key: "unstable-key" },
      { ...execution, estimate_credentials_ref: undefined },
    ])
      expect(validate(JSON.parse(JSON.stringify(invalid))).valid).toBe(false);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("requires both project and report identity and leaves unrelated tools untouched", () => {
    expect(() => dispatchResearchWorkspaceTool("getAgentReport", { project_id: project })).toThrow(
      "report_id is required",
    );
    expect(() => dispatchResearchWorkspaceTool("runSiteAudit", {})).toThrow(
      "project_id is required",
    );
    expect(dispatchResearchWorkspaceTool("getKeyword", {})).toBeNull();
  });
});
