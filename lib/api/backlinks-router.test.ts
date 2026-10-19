import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  auth: vi.fn(),
  loadMore: vi.fn(),
  SnapshotExpiredError: class BacklinksSnapshotExpiredError extends Error {},
}));

vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
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
vi.mock("@/lib/backlinks/service", () => ({
  analyzeBacklinks: mocks.analyze,
  BacklinksSnapshotExpiredError: mocks.SnapshotExpiredError,
  loadMoreBacklinkRows: mocks.loadMore,
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
const success = {
  cached: true,
  cachedUntil: "2026-07-25T15:00:00.000Z",
  costCents: 0,
  fetchedAt: "2026-07-24T15:00:00.000Z",
  fetchedRowCount: 0,
  history: [],
  includeSubdomains: true,
  ok: true,
  provider: "dataforseo",
  rows: [],
  summary: {
    backlinksTotal: 0,
    brokenBacklinks: 0,
    brokenPages: 0,
    dofollowPct: 0,
    domainRank: 0,
    lostBacklinks: 0,
    lostReferringDomains: 0,
    newBacklinks: 0,
    newReferringDomains: 0,
    referringDomainsTotal: 0,
    referringPages: 0,
    spamScore: 0,
  },
  target: "example.com",
  targetScope: "site",
  totalRowsAvailable: 0,
};

function authenticate(scopes: string[]) {
  mocks.auth.mockResolvedValue({
    apiKey: { id: "key_1", projectId: project.id, scopes },
    kind: "project_key",
    project,
  });
}

function request(method: "GET" | "POST", path: string, body?: unknown) {
  return new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
}

async function route(method: "GET" | "POST", path: string, body?: unknown) {
  return handleApiRequest(request(method, path, body), path.split("?")[0]?.split("/").slice(1));
}

describe("backlinks router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate(["write"]);
    mocks.analyze.mockResolvedValue(success);
    mocks.loadMore.mockResolvedValue(success);
  });

  it("dispatches both operations with rate-limit headers", async () => {
    const analyze = await route("GET", `/projects/${projectPublicId}/backlinks?target=example.com`);
    const rows = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
      include_subdomains: true,
      limit: 100,
      target: "example.com",
      target_scope: "site",
    });

    expect(analyze.status).toBe(200);
    expect(rows.status).toBe(200);
    expect(analyze.headers.get("ratelimit-remaining")).toBe("99");
    expect(rows.headers.get("ratelimit-limit")).toBe("100");
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.loadMore).toHaveBeenCalledOnce();
  });

  it("requires write scope for both budget-spending operations", async () => {
    authenticate(["read"]);

    const analyze = await route("GET", `/projects/${projectPublicId}/backlinks?target=example.com`);
    const rows = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
      include_subdomains: true,
      limit: 100,
      target: "example.com",
      target_scope: "site",
    });

    expect(analyze.status).toBe(403);
    expect(rows.status).toBe(403);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.loadMore).not.toHaveBeenCalled();
  });

  it("returns the named next-page estimate and forwards both body options", async () => {
    authenticate(["read"]);
    mocks.loadMore.mockResolvedValue({
      ok: true,
      estimate: true,
      cached: false,
      cachedUntil: null,
      costCents: 0.6,
      estimatedCostCents: 0.6,
      provider: "dataforseo",
      includeSubdomains: true,
      target: "example.com",
      targetScope: "site",
    });
    const response = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
      include_subdomains: true,
      target: "example.com",
      target_scope: "site",
      limit: 300,
      estimate_only: true,
      max_cost_cents: 0,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { estimate: true, estimated_cost_cents: 0.6, cost_cents: 0.6 },
    });
    expect(mocks.loadMore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estimateOnly: true, maxCostCents: 0, limit: 300 }),
    );
  });

  it.each([false, "true", 1, undefined])(
    "keeps write scope for rows estimate_only=%j",
    async (estimate_only) => {
      authenticate(["read"]);
      const response = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
        include_subdomains: true,
        target: "example.com",
        target_scope: "site",
        limit: 300,
        estimate_only,
      });
      expect(response.status).toBe(403);
      expect(mocks.loadMore).not.toHaveBeenCalled();
    },
  );

  it("returns 422 with estimated_cost_cents when the next page exceeds the cap", async () => {
    mocks.loadMore.mockResolvedValue({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: 0.6,
    });
    const response = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
      include_subdomains: true,
      target: "example.com",
      target_scope: "site",
      limit: 300,
      max_cost_cents: 0,
    });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/cost_limit_exceeded",
      details: { estimated_cost_cents: 0.6 },
    });
  });

  it.each([{ estimate_only: "true" }, { max_cost_cents: -1 }, { max_cost_cents: 0.5 }])(
    "rejects invalid new body options %j",
    async (options) => {
      const response = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, {
        include_subdomains: true,
        target: "example.com",
        target_scope: "site",
        limit: 300,
        ...options,
      });
      expect(response.status).toBe(400);
      expect(mocks.loadMore).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing target", "target", ""],
    ["target scope", "target_scope", "?target=example.com&target_scope=domain"],
    ["subdomain boolean", "include_subdomains", "?target=example.com&include_subdomains=1"],
    ["result limit", "result_limit", "?target=example.com&result_limit=200"],
    ["row mode", "mode", "?target=example.com&mode=dedupe"],
    ["estimate boolean", "estimate_only", "?target=example.com&estimate_only=1"],
    ["fresh boolean", "fresh", "?target=example.com&fresh=1"],
    ["zero max cost", "max_cost_cents", "?target=example.com&max_cost_cents=0"],
    ["fractional max cost", "max_cost_cents", "?target=example.com&max_cost_cents=1.5"],
  ])("returns a 400 problem for invalid %s", async (_case, field, search) => {
    const response = await route("GET", `/projects/${projectPublicId}/backlinks${search}`);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      errors: { fieldErrors: { [field]: expect.any(Array) } },
      status: 400,
      title: "Validation failed",
    });
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it.each([
    ["missing target", "target", { include_subdomains: true, limit: 100, target_scope: "site" }],
    [
      "target scope",
      "target_scope",
      { include_subdomains: true, limit: 100, target: "example.com", target_scope: "domain" },
    ],
    [
      "subdomain type",
      "include_subdomains",
      { include_subdomains: "true", limit: 100, target: "example.com", target_scope: "site" },
    ],
    [
      "limit multiple",
      "limit",
      { include_subdomains: true, limit: 150, target: "example.com", target_scope: "site" },
    ],
    [
      "limit minimum",
      "limit",
      { include_subdomains: true, limit: 0, target: "example.com", target_scope: "site" },
    ],
    [
      "limit maximum",
      "limit",
      { include_subdomains: true, limit: 1100, target: "example.com", target_scope: "site" },
    ],
  ])("returns a 400 problem for invalid body %s", async (_case, field, body) => {
    const response = await route("POST", `/projects/${projectPublicId}/backlinks/rows`, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errors: { fieldErrors: { [field]: expect.any(Array) } },
      status: 400,
    });
    expect(mocks.loadMore).not.toHaveBeenCalled();
  });
});
