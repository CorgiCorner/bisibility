import type { ApiContext } from "@/lib/api/context";
import { expect, it, vi } from "vitest";
import { dispatchMcpTool } from "./tools";

const mocks = vi.hoisted(() => ({ keywords: vi.fn(), pages: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain-overview/service", () => ({
  loadDomainKeywordsPage: mocks.keywords,
  loadDomainPagesPage: mocks.pages,
}));
vi.mock("@/lib/api/router", () => ({
  async handleApiRequest(req: Request, path: string[]) {
    const { postDomainOverviewKeywords, postDomainOverviewPages } = await import(
      "@/lib/api/domain-overview"
    );
    const projectId = path[1];
    const ctx = {
      req,
      url: new URL(req.url),
      path,
      method: "POST",
      headers: new Headers(),
      instance: "urn:test",
      auth: { project: { id: "project", publicId: projectId } },
      origin: { source: "mcp", credentialKind: "project_key", credentialId: "test-key" },
    } as ApiContext;
    return path[3] === "keywords"
      ? postDomainOverviewKeywords(ctx, projectId)
      : postDomainOverviewPages(ctx, projectId);
  },
}));

it.each(["keywords", "pages"] as const)(
  "preserves %s failure metadata through the real API handler and MCP transport",
  async (module) => {
    mocks[module].mockResolvedValueOnce({
      costCents: 2,
      ok: false,
      reason: "provider_error",
      phase: "provider",
      providerCode: "provider_auth",
    });
    const result = await dispatchMcpTool(
      `load_domain_overview_${module}`,
      {
        project_id: "prj_a00000000000000000000000",
        target: "example.com",
        language_code: "en",
        location_code: 2840,
        limit: 100,
        offset: 0,
        max_cost_cents: 10,
      },
      "synthetic-key",
    );
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      payload: {
        errors: {
          reason: "provider_error",
          phase: "provider",
          provider_code: "provider_auth",
          cost_cents: 2,
        },
      },
    });
  },
);
