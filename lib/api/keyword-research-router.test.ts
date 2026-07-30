import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  metrics: vi.fn(),
  research: vi.fn(),
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
vi.mock("@/lib/keyword-research/service", () => ({
  fetchKeywordMetrics: mocks.metrics,
  researchKeywords: mocks.research,
}));

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  publicId: "prj_a00000000000000000000000",
  writeMode: "writable",
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

function request(method: "GET" | "POST", path: string, body?: unknown) {
  return new Request(`https://example.com/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
}

const researchSuccess = {
  cached: true,
  connections: [],
  costCents: 2,
  fetchedAt: "2026-07-22T10:00:00.000Z",
  ok: true,
  provider: "DataForSEO",
  rows: [],
  sources: [],
};
const metricsSuccess = {
  cachedCount: 0,
  connections: [],
  costCents: 1,
  fetchedAt: "2026-07-22T10:00:00.000Z",
  fetchedCount: 1,
  ok: true,
  provider: "DataForSEO",
  rows: [],
};

describe("keyword research router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["write"]);
    mocks.research.mockResolvedValue(researchSuccess);
    mocks.metrics.mockResolvedValue(metricsSuccess);
  });

  it("routes both operations with auth and rate-limit headers", async () => {
    const research = await handleApiRequest(
      request("GET", "/projects/prj_a00000000000000000000000/keyword-research?seed=test"),
      ["projects", "prj_a00000000000000000000000", "keyword-research"],
    );
    const metrics = await handleApiRequest(
      request("POST", "/projects/prj_a00000000000000000000000/keyword-metrics", {
        keywords: ["test"],
      }),
      ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    );
    expect(research.status).toBe(200);
    expect(metrics.status).toBe(200);
    expect(research.headers.get("ratelimit-remaining")).toBe("99");
    expect(metrics.headers.get("ratelimit-limit")).toBe("100");
    expect(mocks.research).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
    expect(mocks.metrics).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
  });

  it("requires write scope for both budget-spending operations", async () => {
    authenticate(["read"]);
    const research = await handleApiRequest(
      request("GET", "/projects/prj_a00000000000000000000000/keyword-research?seed=test"),
      ["projects", "prj_a00000000000000000000000", "keyword-research"],
    );
    const metrics = await handleApiRequest(
      request("POST", "/projects/prj_a00000000000000000000000/keyword-metrics", {
        keywords: ["test"],
      }),
      ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    );
    expect(research.status).toBe(403);
    expect(metrics.status).toBe(403);
    expect(mocks.research).not.toHaveBeenCalled();
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("returns 200 when auto research skips every source at the request cost guard", async () => {
    mocks.research.mockResolvedValue({
      ...researchSuccess,
      cached: false,
      costCents: 0,
      rows: [],
      sources: [
        {
          cached: false,
          costCents: 0,
          reason: "cost_limit",
          returned: 0,
          source: "related",
          status: "skipped",
        },
      ],
    });
    const response = await handleApiRequest(
      request(
        "GET",
        "/projects/prj_a00000000000000000000000/keyword-research?seed=test&mode=auto&max_cost_cents=1",
      ),
      ["projects", "prj_a00000000000000000000000", "keyword-research"],
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rows: [],
      sources: [{ reason: "cost_limit", status: "skipped" }],
    });
  });

  it("routes estimate and request cost guard inputs without spending semantics", async () => {
    await handleApiRequest(
      request(
        "GET",
        "/projects/prj_a00000000000000000000000/keyword-research?seed=test&estimate_only=true&max_cost_cents=7",
      ),
      ["projects", "prj_a00000000000000000000000", "keyword-research"],
    );
    await handleApiRequest(
      request("POST", "/projects/prj_a00000000000000000000000/keyword-metrics", {
        estimate_only: true,
        keywords: ["test"],
        max_cost_cents: 7,
      }),
      ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    );
    expect(mocks.research).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, maxCostCents: 7 }),
    );
    expect(mocks.metrics).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, maxCostCents: 7 }),
    );
  });

  it.each([
    ["no_source", 404],
    ["budget_exhausted", 429],
    ["rate_limited", 429],
    ["unsupported_location", 422],
    ["needs_reauth", 422],
    ["cost_limit_exceeded", 422],
    ["in_progress", 429],
  ] as const)("maps research %s through the router", async (reason, status) => {
    mocks.research.mockResolvedValue({ ok: false, reason, resetAt: Date.now() + 5_000 });
    const response = await handleApiRequest(
      request("GET", "/projects/prj_a00000000000000000000000/keyword-research?seed=test"),
      ["projects", "prj_a00000000000000000000000", "keyword-research"],
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("ratelimit-remaining")).toBe("99");
    if (reason === "rate_limited" || reason === "in_progress")
      expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it.each([
    ["no_source", 404],
    ["budget_exhausted", 429],
    ["rate_limited", 429],
    ["unsupported_location", 422],
    ["needs_reauth", 422],
    ["cost_limit_exceeded", 422],
    ["in_progress", 429],
  ] as const)("maps metrics %s through the router", async (reason, status) => {
    mocks.metrics.mockResolvedValue({ ok: false, reason, resetAt: Date.now() + 5_000 });
    const response = await handleApiRequest(
      request("POST", "/projects/prj_a00000000000000000000000/keyword-metrics", {
        keywords: ["test"],
      }),
      ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("ratelimit-remaining")).toBe("99");
    if (reason === "rate_limited" || reason === "in_progress")
      expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it("maps metrics request validation through the router", async () => {
    const invalid = await handleApiRequest(
      request("POST", "/projects/prj_a00000000000000000000000/keyword-metrics", { keywords: [] }),
      ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    );
    expect(invalid.status).toBe(400);
  });
});
