import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findBacklinks: vi.fn(),
  findDomainOverview: vi.fn(),
  findKeywordResearch: vi.fn(),
  listBacklinks: vi.fn(),
  listDomainOverviews: vi.fn(),
  listKeywordResearch: vi.fn(),
  researchLocation: vi.fn(),
  researchProject: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      headers: new Headers({ "RateLimit-Limit": "100", "RateLimit-Remaining": "99" }),
      success: true,
    }),
  ),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("@/lib/backlinks/stored", () => ({
  findStoredBacklinks: mocks.findBacklinks,
  listStoredBacklinks: mocks.listBacklinks,
}));
vi.mock("@/lib/domain-overview/stored", () => ({
  findStoredDomainOverview: mocks.findDomainOverview,
  listStoredDomainOverviews: mocks.listDomainOverviews,
}));
vi.mock("@/lib/keyword-research/context", () => ({
  keywordResearchProject: mocks.researchProject,
  researchLocation: mocks.researchLocation,
}));
vi.mock("@/lib/keyword-research/stored-read", () => ({
  findStoredKeywordResearch: mocks.findKeywordResearch,
  listStoredKeywordResearch: mocks.listKeywordResearch,
}));

const projectPublicId = "prj_a00000000000000000000000";
const otherProjectPublicId = "prj_b00000000000000000000000";
const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  publicId: projectPublicId,
  writeMode: "writable",
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

async function route(path: string, segments: string[]) {
  const request = new Request(`https://example.com/api/v1${path}`, {
    headers: { authorization: "Bearer bsb_key_live_test_key" },
    method: "GET",
  });
  return handleApiRequest(request, segments);
}

describe("stored research reports router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["read"]);
    mocks.listBacklinks.mockResolvedValue([]);
    mocks.listDomainOverviews.mockResolvedValue([]);
    mocks.listKeywordResearch.mockResolvedValue([]);
  });

  it("returns the typed 404 when nothing is stored or the kind is unknown", async () => {
    mocks.findBacklinks.mockResolvedValue(null);

    const missing = await route(
      `/projects/${projectPublicId}/research/reports/backlinks?target=missing.example`,
      ["projects", projectPublicId, "research", "reports", "backlinks"],
    );
    const unknownKind = await route(`/projects/${projectPublicId}/research/reports/nope`, [
      "projects",
      projectPublicId,
      "research",
      "reports",
      "nope",
    ]);

    for (const response of [missing, unknownKind]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      await expect(response.json()).resolves.toMatchObject({
        detail: "No stored research report matches this request.",
        status: 404,
        title: "Not found",
        type: "https://bisibility.com/problems/not_found",
      });
    }
  });

  it("rejects a project-scoped key for another project with the scope error", async () => {
    const response = await route(`/projects/${otherProjectPublicId}/research/reports`, [
      "projects",
      otherProjectPublicId,
      "research",
      "reports",
    ]);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "API key is not scoped to this project.",
      status: 403,
      title: "Forbidden",
    });
    expect(mocks.listBacklinks).not.toHaveBeenCalled();
  });

  it("serves both endpoints to a read-scope key without touching stored reads on scope errors", async () => {
    const list = await route(`/projects/${projectPublicId}/research/reports`, [
      "projects",
      projectPublicId,
      "research",
      "reports",
    ]);
    const missingReport = await route(
      `/projects/${projectPublicId}/research/reports/backlinks?target=missing.example`,
      ["projects", projectPublicId, "research", "reports", "backlinks"],
    );

    expect(list.status).toBe(200);
    expect(missingReport.status).toBe(404);
    expect(mocks.listBacklinks).toHaveBeenCalledOnce();
    expect(mocks.findBacklinks).toHaveBeenCalledOnce();
  });

  it("declares both operations in the OpenAPI document", async () => {
    const { getOpenApiDocument } = await import("./openapi");
    const document = getOpenApiDocument();

    expect(document.paths["/projects/{project_id}/research/reports"].get).toMatchObject({
      operationId: "listStoredResearchReports",
    });
    expect(document.paths["/projects/{project_id}/research/reports/{kind}"].get).toMatchObject({
      operationId: "getStoredResearchReport",
    });
  });
});
