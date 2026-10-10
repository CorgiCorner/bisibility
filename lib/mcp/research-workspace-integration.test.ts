import { handleApiRequest } from "@/lib/api/router";
import { AuditRateLimitError } from "@/lib/site-audit/errors";
import seoFixture from "@/plugins/bisibility/skills/seo-audit/references/example-report.json";
import {
  reportLink,
  validateReport,
} from "@/plugins/bisibility/skills/seo-audit/scripts/validate-report.mjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchMcpTool } from "./tools";
import type { JsonObject } from "./types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  context: vi.fn(),
  catalog: vi.fn(),
  saveContext: vi.fn(),
  createReport: vi.fn(),
  getReport: vi.fn(),
  listReports: vi.fn(),
  visibility: vi.fn(),
  prompts: vi.fn(),
  runAudit: vi.fn(),
  listAudits: vi.fn(),
  readAudit: vi.fn(),
  fetch: vi.fn(),
  prisma: { project: { findFirst: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/api/auth", () => ({
  ApiAuthError: class extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/api/idempotency", () => ({
  withIdempotency: vi.fn((_input, execute) => execute()),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/project-context/service", () => ({
  getProjectContext: mocks.context,
  saveProjectContext: mocks.saveContext,
}));
vi.mock("@/lib/agent-reports/service", () => ({
  createAgentReport: mocks.createReport,
  getAgentReport: mocks.getReport,
  listAgentReportPage: mocks.listReports,
}));
vi.mock("@/lib/site-audit/service", () => ({
  runSiteAudit: mocks.runAudit,
  listSiteAudits: mocks.listAudits,
  readSiteAudit: mocks.readAudit,
}));
vi.mock("@/lib/ai-research/catalog-service", () => ({ getAiResearchCatalog: mocks.catalog }));
vi.mock("@/lib/ai-research/service", () => ({
  analyzeAiVisibility: mocks.visibility,
  compareAiPrompts: mocks.prompts,
}));

const projectId = "prj_a00000000000000000000000";
const reportId = "agr_a00000000000000000000000";
const stamp = "2026-10-02T10:00:00.000Z";
const project = {
  id: "project_internal_1",
  publicId: projectId,
  domain: "example.com",
  ownerId: "owner1",
  name: "Example",
  writeMode: "active",
};
const key = { id: "key1", projectId: project.id, scopes: ["read", "write"] };
const contextFields = {
  business: "Tools",
  audience: "Teams",
  products: "Search",
  goals: "Growth",
  agent_rules: "Bound costs",
};
const analysisFields = { brand: "Example", domain: "example.com", max_cost_cents: 5 };
const opaque = {
  modelResponse: { customKey: "preserve", snake_key: 1 },
  URLValue: "https://example.com",
};
const report = {
  id: reportId,
  kind: "external_analysis",
  title: "Review",
  body: opaque,
  provenance: { sourceType: "external_analysis" },
  createdAt: stamp,
};
const operations: [string, JsonObject, number][] = [
  ["get_ai_research_catalog", {}, 200],
  ["get_project_context", {}, 200],
  ["update_project_context", contextFields, 200],
  ["list_agent_reports", { kind: "external_analysis", limit: 2 }, 200],
  [
    "create_agent_report",
    {
      kind: "external_analysis",
      title: "Review",
      body: opaque,
      provenance: { sourceType: "external_analysis" },
    },
    201,
  ],
  ["get_agent_report", { report_id: reportId }, 200],
  ["analyze_ai_visibility", analysisFields, 200],
  [
    "compare_ai_prompts",
    { ...analysisFields, prompt: "Compare tools", models: ["gpt-4.1-mini"] },
    200,
  ],
  ["run_site_audit", { max_pages: 2 }, 200],
  ["list_site_audits", {}, 200],
  ["get_site_audit", { report_id: reportId }, 200],
];
const operationServices: Record<string, typeof mocks.context> = {
  get_ai_research_catalog: mocks.catalog,
  get_project_context: mocks.context,
  update_project_context: mocks.saveContext,
  list_agent_reports: mocks.listReports,
  create_agent_report: mocks.createReport,
  get_agent_report: mocks.getReport,
  analyze_ai_visibility: mocks.visibility,
  compare_ai_prompts: mocks.prompts,
  run_site_audit: mocks.runAudit,
  list_site_audits: mocks.listAudits,
  get_site_audit: mocks.readAudit,
};
const writes = operations.filter(([name]) =>
  [
    "update_project_context",
    "create_agent_report",
    "analyze_ai_visibility",
    "compare_ai_prompts",
    "run_site_audit",
  ].includes(name),
);
function auth(scopes = key.scopes, writeMode = "active") {
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { ...key, scopes },
    project: { ...project, writeMode },
  });
}
function expectNoWork() {
  for (const service of [
    mocks.saveContext,
    mocks.createReport,
    mocks.visibility,
    mocks.prompts,
    mocks.runAudit,
  ])
    expect(service).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks();
  auth();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.project.findUnique.mockResolvedValue(project);
  mocks.catalog.mockResolvedValue({
    ok: true,
    catalog: { models: [{ id: "catalog-model", priceAvailable: false }], fetchedAt: stamp },
  });
  mocks.context.mockResolvedValue({
    ...contextFields,
    agentRules: contextFields.agent_rules,
    updatedAt: stamp,
  });
  mocks.saveContext.mockImplementation(async (_id, input) => ({ ...input, updatedAt: stamp }));
  mocks.createReport.mockResolvedValue(report);
  mocks.getReport.mockImplementation(async (input) =>
    input.projectId === project.id ? report : null,
  );
  mocks.listReports.mockResolvedValue({ reports: [report], hasMore: false });
  mocks.visibility.mockResolvedValue({
    ok: true,
    sourceType: "observed_provider_aggregate",
    reportId,
  });
  mocks.prompts.mockResolvedValue({
    ok: true,
    sourceType: "synthetic_prompt_test",
    reportId,
    answers: [{ modelId: "gpt-4.1-mini", brandMentions: 1 }],
  });
  mocks.runAudit.mockResolvedValue({
    id: reportId,
    createdAt: stamp,
    result: { pages: [{ responseTimeMs: 10 }] },
  });
  mocks.listAudits.mockResolvedValue([{ id: reportId, createdAt: stamp }]);
  mocks.readAudit.mockResolvedValue({
    id: reportId,
    createdAt: stamp,
    result: { pages: [{ responseTimeMs: 10 }] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("MCP dispatch through the REST router and research handlers", () => {
  it("completes a fixture audit through context, bounded crawl, external analysis save and readback", async () => {
    const crawlId = seoFixture.body.coverage.crawl_id;
    const rawCrawl = {
      id: crawlId,
      createdAt: stamp,
      cached: false,
      result: {
        state: "partial",
        stopReason: "page_limit",
        startedAt: stamp,
        completedAt: stamp,
        limits: { maxPages: 2, maxRequests: 20, maxDurationMs: 15000, maxPageBytes: 524288 },
        pages: [
          {
            url: "https://example.com/",
            status: 200,
            title: "Example",
            headings: [{ level: 1, text: "Example" }],
          },
          { url: "https://example.com/pricing", status: 404, title: null, headings: [] },
        ],
        limitations: ["Fictional HTTP sample; indexing and full content are not verified."],
      },
    };
    mocks.runAudit.mockResolvedValueOnce(rawCrawl);
    mocks.readAudit.mockResolvedValueOnce(rawCrawl);
    const context = await dispatchMcpTool(
      "get_project_context",
      { project_id: projectId },
      "bsb_key_test",
    );
    expect(context.payload).toMatchObject({ business: "Tools", goals: "Growth" });
    const crawl = await dispatchMcpTool(
      "run_site_audit",
      { project_id: projectId, max_pages: 2 },
      "bsb_key_test",
    );
    expect(crawl.payload).toMatchObject({
      data: { id: crawlId, result: { stop_reason: "page_limit" } },
    });
    const detail = await dispatchMcpTool(
      "get_site_audit",
      { project_id: projectId, report_id: crawlId },
      "bsb_key_test",
    );
    expect(detail.payload).toMatchObject({
      data: { result: { pages: [{ status: 200 }, { status: 404 }] } },
    });
    // The fixture is an external agent's authored analysis, not a built-in model run.
    const payload = validateReport(structuredClone(seoFixture));
    mocks.createReport.mockImplementationOnce(async (input) => ({
      ...input,
      id: reportId,
      createdAt: stamp,
    }));
    const saved = await dispatchMcpTool("create_agent_report", payload, "bsb_key_test");
    expect(saved).toMatchObject({
      ok: true,
      status: 201,
      payload: { id: reportId, kind: "seo_audit" },
    });
    mocks.getReport.mockResolvedValueOnce({ ...payload, id: reportId, createdAt: stamp });
    const readback = await dispatchMcpTool(
      "get_agent_report",
      { project_id: projectId, report_id: reportId },
      "bsb_key_test",
    );
    expect(readback.payload).toMatchObject({ body: payload.body, provenance: payload.provenance });
    expect(reportLink("https://bisibility.com", projectId, reportId)).toBe(
      `https://bisibility.com/app/${projectId}/agent-reports/${reportId}`,
    );
    expect(mocks.visibility).not.toHaveBeenCalled();
    expect(mocks.prompts).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(operations)("executes %s against its real handler", async (name, input, status) => {
    const result = await dispatchMcpTool(name, { project_id: projectId, ...input }, "bsb_key_test");
    expect(result).toMatchObject({ ok: true, status });
    expect(operationServices[name]).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves opaque report JSON while adapting transport metadata and context", async () => {
    const saved = await dispatchMcpTool(
      "create_agent_report",
      { project_id: projectId, kind: "external_analysis", title: "Review", body: opaque },
      "bsb_key_test",
    );
    expect(saved.payload).toMatchObject({
      body: opaque,
      created_at: stamp,
      provenance: { sourceType: "external_analysis" },
    });
    expect(mocks.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ body: opaque, projectId: project.id, actorId: null }),
    );
    const context = await dispatchMcpTool(
      "update_project_context",
      { project_id: projectId, ...contextFields },
      "bsb_key_test",
    );
    expect(context.payload).toMatchObject({ agent_rules: "Bound costs", updated_at: stamp });
    expect(mocks.saveContext).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ agentRules: "Bound costs" }),
    );
  });
  it("passes cost caps, model choice and MCP credential attribution to AI services", async () => {
    const comparison = await dispatchMcpTool(
      "compare_ai_prompts",
      {
        project_id: projectId,
        ...analysisFields,
        prompt: "Compare tools",
        models: ["gpt-4.1-mini"],
      },
      "bsb_key_test",
    );
    expect(comparison.payload).toMatchObject({
      data: {
        source_type: "synthetic_prompt_test",
        answers: [{ model_id: "gpt-4.1-mini", brand_mentions: 1 }],
      },
    });
    expect(mocks.prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        origin: { credential: { id: "key1", kind: "project_key" }, source: "mcp" },
      }),
      expect.objectContaining({ max_cost_cents: 5, models: ["gpt-4.1-mini"] }),
    );
  });
  it.each(writes)(
    "denies %s to read-scope keys before service/provider work",
    async (name, input) => {
      auth(["read"]);
      const result = await dispatchMcpTool(
        name,
        { project_id: projectId, ...input },
        "bsb_key_test",
      );
      expect(result.status).toBe(403);
      expectNoWork();
    },
  );
  it("intersects personal token write scopes with a viewer membership before AI work", async () => {
    mocks.auth.mockResolvedValue({
      kind: "personal_token",
      token: { id: "pat1", scopes: ["read", "write"] },
      user: { id: "viewer1" },
      memberships: [{ projectId: project.id, role: "viewer" }],
    });
    const result = await dispatchMcpTool(
      "compare_ai_prompts",
      { project_id: projectId, ...analysisFields, prompt: "Compare tools" },
      "bsb_pat_live_test",
    );
    expect(result.status).toBe(403);
    expectNoWork();
  });
  it.each(writes)(
    "denies %s in migration hold before service/provider work",
    async (name, input) => {
      auth(key.scopes, "migration_hold");
      const result = await dispatchMcpTool(
        name,
        { project_id: projectId, ...input },
        "bsb_key_test",
      );
      expect(result.status).toBe(423);
      expectNoWork();
    },
  );
  it.each(operations)("isolates %s from another project", async (name, input) => {
    const result = await dispatchMcpTool(
      name,
      { project_id: "prj_b00000000000000000000000", ...input },
      "bsb_key_test",
    );
    expect(result.status).toBe(403);
    expectNoWork();
    expect(mocks.getReport).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.readAudit).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.listAudits).not.toHaveBeenCalled();
  });
  it.each(["site_audit", "ai_visibility", "prompt_explorer", "SITE_AUDIT"])(
    "rejects external reports claiming reserved producer kind %s",
    async (kind) => {
      const result = await dispatchMcpTool(
        "create_agent_report",
        { project_id: projectId, kind, title: "Forged", body: {} },
        "bsb_key_test",
      );
      expect(result.status).toBe(400);
      expectNoWork();
    },
  );
  it.each([
    { max_cost_cents: -1 },
    { max_cost_cents: 1001 },
    { max_cost_cents: 1.2 },
    { models: ["invalid/model"] },
    { models: ["gpt-4.1-mini", "gpt-4.1-mini"] },
  ])("rejects invalid AI cap or model %j", async (invalid) => {
    const result = await dispatchMcpTool(
      "compare_ai_prompts",
      { project_id: projectId, ...analysisFields, prompt: "Compare tools", ...invalid },
      "bsb_key_test",
    );
    expect(result.status).toBe(400);
    expectNoWork();
  });
  it("defers valid model IDs to admission and preserves its refusal through MCP", async () => {
    mocks.prompts.mockResolvedValue({
      ok: false,
      reason: "model_not_enabled",
      message: "This model requires explicit own-key actual-cost consent.",
    });
    const result = await dispatchMcpTool(
      "compare_ai_prompts",
      {
        project_id: projectId,
        ...analysisFields,
        prompt: "Compare tools",
        models: ["unsupported-model"],
      },
      "bsb_key_test",
    );
    expect(result.status).toBe(422);
    expect(result.payload).toMatchObject({
      errors: { reason: "model_not_enabled", retry_blocked: false },
    });
    expect(mocks.prompts).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ models: ["unsupported-model"] }),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["agent-reports", "site-audits"])(
    "rejects malformed agr identifiers for %s at REST dispatch",
    async (resource) => {
      const path = ["projects", projectId, resource, "agr_invalid"];
      const response = await handleApiRequest(
        new Request(`https://example.test/api/v1/${path.join("/")}`),
        path,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "https://bisibility.com/problems/invalid_public_id",
      });
      expect(mocks.getReport).not.toHaveBeenCalled();
      expect(mocks.readAudit).not.toHaveBeenCalled();
    },
  );
  it.each(["get_agent_report", "get_site_audit"])(
    "rejects malformed report identifiers before MCP REST dispatch for %s",
    async (name) => {
      await expect(
        dispatchMcpTool(name, { project_id: projectId, report_id: "agr_invalid" }, "bsb_key_test"),
      ).rejects.toThrow();
      expect(mocks.getReport).not.toHaveBeenCalled();
      expect(mocks.readAudit).not.toHaveBeenCalled();
      expect(mocks.auth).not.toHaveBeenCalled();
    },
  );
  it("preserves the REST audit quota status and retry metadata through MCP", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_010_000);
    try {
      mocks.runAudit.mockRejectedValueOnce(new AuditRateLimitError(1_800_000_060_000, 2, 0));
      const result = await dispatchMcpTool(
        "run_site_audit",
        { project_id: projectId, max_pages: 3 },
        "bsb_key_test",
      );
      expect(result).toMatchObject({
        ok: false,
        status: 429,
        payload: {
          type: "https://bisibility.com/problems/rate_limited",
          status: 429,
          details: { reset_at: 1_800_000_060_000, retry_after_seconds: 50 },
        },
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
  it("keeps saved reports available in read-only mode", async () => {
    auth(["read"], "migration_hold");
    for (const name of ["get_agent_report", "get_site_audit"])
      expect(
        (
          await dispatchMcpTool(
            name,
            { project_id: projectId, report_id: reportId },
            "bsb_key_test",
          )
        ).status,
      ).toBe(200);
  });
});
