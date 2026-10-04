import { researchWorkspaceOperationPolicy } from "@/lib/api/research-workspace-policy";
import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { researchWorkspaceToolNames } from "./research-workspace-contract";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";

const project = "prj_a00000000000000000000000";
const report = "agr_a00000000000000000000000";

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
      expect(tool?.inputSchema.required).toContain("max_cost_cents");
      expect(tool?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    }
    expect(definitions.find((tool) => tool.name === "compare_ai_prompts")?.description).toContain(
      "not observed",
    );
    for (const name of Object.values(researchWorkspaceToolNames))
      expect(definitions.find((tool) => tool.name === name)).toBeDefined();
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
