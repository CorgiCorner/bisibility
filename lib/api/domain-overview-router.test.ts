import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  auth: vi.fn(),
  history: vi.fn(),
  keywords: vi.fn(),
  pages: vi.fn(),
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
vi.mock("@/lib/domain-overview/service", () => ({
  analyzeDomainOverview: mocks.analyze,
  loadDomainKeywordsPage: mocks.keywords,
  loadDomainOverviewHistory: mocks.history,
  loadDomainPagesPage: mocks.pages,
}));

const projectPublicId = "prj_a00000000000000000000000";
const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  publicId: projectPublicId,
  writeMode: "writable",
};
const commonBody = {
  language_code: "en",
  location_code: 2840,
  max_cost_cents: 0,
  target: "example.com",
};
const moduleSuccess = {
  cached: true,
  costCents: 0,
  data: [],
  fetchedAt: "2026-08-13T10:00:00.000Z",
  ok: true,
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

async function route(action: string, body: unknown) {
  const path = `/projects/${projectPublicId}/domain-overview/${action}`;
  const request = new Request(`https://example.test/api/v1${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  return handleApiRequest(request, path.split("/").slice(1));
}

describe("Domain Overview router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["write"]);
    mocks.analyze.mockResolvedValue({
      cached: true,
      estimate: true,
      estimatedCostCents: 0,
      freshEstimatedCostCents: 5,
      historyEstimatedCostCents: 12,
      historyMode: "lazy",
      keywordPageEstimatedCostCents: 2,
      languageCode: "en",
      locationCode: 2840,
      ok: true,
      pagePageEstimatedCostCents: 2,
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
    });
    mocks.history.mockResolvedValue(moduleSuccess);
    mocks.keywords.mockResolvedValue({
      ...moduleSuccess,
      data: { costCents: 0, rows: [], totalCount: 0 },
    });
    mocks.pages.mockResolvedValue({
      ...moduleSuccess,
      data: { costCents: 0, rows: [], totalCount: 0 },
    });
  });

  it("dispatches all four POST operations", async () => {
    const responses = await Promise.all([
      route("analyze", commonBody),
      route("history", commonBody),
      route("keywords", { ...commonBody, limit: 100, offset: 0 }),
      route("pages", { ...commonBody, limit: 100, offset: 0 }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.history).toHaveBeenCalledOnce();
    expect(mocks.keywords).toHaveBeenCalledOnce();
    expect(mocks.pages).toHaveBeenCalledOnce();
  });

  it("requires write scope for estimates and paid operations", async () => {
    authenticate(["read"]);

    const response = await route("analyze", { ...commonBody, estimate_only: true });

    expect(response.status).toBe(403);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it.each([
    ["analyze", { fresh: false, language_code: "en", location_code: 2840, target: "example.com" }],
    ["analyze", { fresh: true, language_code: "en", location_code: 2840, target: "example.com" }],
    ["history", { fresh: false, language_code: "en", location_code: 2840, target: "example.com" }],
    ["history", { fresh: true, language_code: "en", location_code: 2840, target: "example.com" }],
    [
      "keywords",
      {
        fresh: false,
        language_code: "en",
        limit: 100,
        location_code: 2840,
        offset: 0,
        target: "example.com",
      },
    ],
    [
      "keywords",
      {
        fresh: true,
        language_code: "en",
        limit: 100,
        location_code: 2840,
        offset: 0,
        target: "example.com",
      },
    ],
    [
      "pages",
      {
        fresh: false,
        language_code: "en",
        limit: 100,
        location_code: 2840,
        offset: 0,
        target: "example.com",
      },
    ],
    [
      "pages",
      {
        fresh: true,
        language_code: "en",
        limit: 100,
        location_code: 2840,
        offset: 0,
        target: "example.com",
      },
    ],
  ])("rejects %s without an explicit paid cap", async (action, body) => {
    const response = await route(action, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errors: { fieldErrors: { max_cost_cents: expect.any(Array) } },
      status: 400,
    });
  });

  it("allows a free estimate without max_cost_cents", async () => {
    const response = await route("analyze", {
      estimate_only: true,
      language_code: "en",
      location_code: 2840,
      target: "example.com",
    });

    expect(response.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estimateOnly: true, maxCostCents: undefined }),
    );
  });

  it("allows an estimate with an explicit zero cap", async () => {
    const response = await route("analyze", {
      ...commonBody,
      estimate_only: true,
      max_cost_cents: 0,
    });

    expect(response.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estimateOnly: true, maxCostCents: 0 }),
    );
  });

  it.each([
    ["keywords", 100, 200, mocks.keywords],
    ["pages", 1_000, 1_001, mocks.pages],
  ] as const)("enforces the public %s page limit", async (action, accepted, rejected, loader) => {
    expect((await route(action, { ...commonBody, limit: accepted, offset: 0 })).status).toBe(200);
    expect((await route(action, { ...commonBody, limit: rejected, offset: 0 })).status).toBe(400);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("rejects unknown fields before the service call", async () => {
    const response = await route("analyze", { ...commonBody, include_subdomains: true });

    expect(response.status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
