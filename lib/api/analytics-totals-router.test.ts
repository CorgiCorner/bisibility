import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connection: vi.fn(),
  ranges: vi.fn(),
  totals: vi.fn(),
  aggregate: vi.fn(),
  envelope: vi.fn(),
}));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchAnalyticsRequestUsage: { findMany: mocks.ranges },
    searchAnalyticsDaily: { aggregate: mocks.aggregate },
  },
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: mocks.connection,
}));
vi.mock("@/lib/search-insights/queries/kpis", () => ({ getWindowTotals: mocks.totals }));
vi.mock("@/lib/providers/analytics/gsc-search-analytics", () => ({
  createGscSearchAnalyticsSession: async () => ({ fetchEnvelope: mocks.envelope }),
}));

import { handleApiRequest } from "./router";

const projectId = "prj_a00000000000000000000000";
function call(query = "start_date=2024-03-01&end_date=2024-03-02", id = projectId) {
  const url = new URL(`https://example.com/api/v1/projects/${id}/analytics/totals?${query}`);
  return handleApiRequest(
    new Request(url, { headers: { authorization: "Bearer bsb_key_test_example" } }),
    url.pathname.slice(8).split("/").filter(Boolean),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key", projectId: "project", scopes: ["read"] },
    project: {
      id: "project",
      publicId: projectId,
      name: "Example",
      domain: "example.com",
      ownerId: "owner",
      writeMode: "writable",
    },
  });
  mocks.connection.mockResolvedValue({
    connection: {
      connectionId: "connection",
      property: "sc-domain:example.com",
      credentials: { apiKey: "fixture-refresh", login: "sc-domain:example.com" },
    },
    problem: null,
  });
  mocks.ranges.mockResolvedValue([]);
  mocks.envelope.mockResolvedValue({
    metadata: { firstIncompleteDate: "2024-03-02" },
    rows: [
      { keys: ["2024-03-01"], clicks: 6, impressions: 12, ctr: 0.5, position: 3 },
      { keys: ["2024-02-29"], clicks: 2, impressions: 10, ctr: 0.2, position: 7 },
    ],
  });
});
it("serves a read-scoped live comparison with conforming period freshness", async () => {
  const response = await call("start_date=2024-03-01&end_date=2024-03-02&compare_previous=true");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    source: "live",
    current: { clicks: 6 },
    previous: { clicks: 2 },
  });
});
it("serves stored zero totals only after coverage proof", async () => {
  mocks.ranges.mockResolvedValue([
    {
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-03-02"),
      persistedAt: new Date("2024-03-05"),
    },
  ]);
  const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  mocks.totals.mockResolvedValue({ current: zero, previous: zero });
  mocks.aggregate.mockResolvedValue({ _min: { date: null }, _max: { date: null } });
  const response = await call();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ source: "stored", current: zero, previous: null });
});
it("rejects a cross-project read before querying connections", async () => {
  expect((await call(undefined, "prj_b00000000000000000000000")).status).toBe(403);
  expect(mocks.connection).not.toHaveBeenCalled();
});
it("enforces the router's read scope before dispatch", async () => {
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key", projectId: "project", scopes: [] },
    project: { id: "project", publicId: projectId },
  });
  expect((await call()).status).toBe(403);
  expect(mocks.connection).not.toHaveBeenCalled();
});
it("returns validation and connection problems in their declared schemas", async () => {
  expect((await call("start_date=2024-02-30&end_date=2024-03-02")).status).toBe(400);
  for (const [problem, status] of [
    ["missing", 404],
    ["needs_reauth", 422],
  ] as const) {
    mocks.connection.mockResolvedValue({ connection: null, problem });
    expect((await call()).status).toBe(status);
  }
});
