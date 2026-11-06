import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const projectId = "prj_a00000000000000000000000";
const state = vi.hoisted(() => ({ connection: vi.fn(), ranges: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { searchAnalyticsRequestUsage: { findMany: state.ranges } },
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: state.connection,
}));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: async (request: Request, path: string[]) => {
    const { getSearchPerformanceTotals } = await import("@/lib/api/analytics-totals");
    expect(request.method).toBe("GET");
    expect(path.slice(2)).toEqual(["analytics", "totals"]);
    return getSearchPerformanceTotals(
      {
        auth: { project: { id: "project", publicId: "prj_a00000000000000000000000" } },
        headers: new Headers(),
        instance: "urn:test",
        req: request,
        url: new URL(request.url),
      } as import("@/lib/api/context").ApiContext,
      path[1],
    );
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
  state.connection.mockResolvedValue({
    connection: {
      connectionId: "connection",
      property: "sc-domain:example.com",
      credentials: {
        apiKey: "fixture-refresh",
        login: "sc-domain:example.com",
        tokenCacheIdentity: { connectionId: "connection", credentialVersion: "fixture-version" },
      },
    },
    problem: null,
  });
  state.ranges.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function rpc(id: number, input: Record<string, unknown>) {
  const { createBisibilityMcpServer } = await import("./server");
  const server = createBisibilityMcpServer({ authorization: "fixture-reader" });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(
      new Request("https://example.com/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "get_search_performance_totals", arguments: input },
        }),
      }),
    );
    expect(response.headers.get("content-type")).toContain("application/json");
    return { status: response.status, body: await response.json() };
  } finally {
    await server.close();
  }
}
const input = {
  project_id: projectId,
  start_date: "2024-03-01",
  end_date: "2024-03-02",
  compare_previous: "true",
};

it("serves both periods through HTTP JSON-RPC and reuses the token cache on a second call", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: "fixture-access", expires_in: 3600 });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      dimensions: ["date"],
      startDate: "2024-02-28",
      endDate: "2024-03-02",
      rowLimit: 1000,
    });
    return Response.json({
      rows: [
        { keys: ["2024-03-01"], clicks: 6, impressions: 12, ctr: 0.5, position: 3 },
        { keys: ["2024-02-29"], clicks: 2, impressions: 10, ctr: 0.2, position: 7 },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  for (const id of [1, 2]) {
    const response = await rpc(id, input);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jsonrpc: "2.0",
      id,
      result: {
        structuredContent: { source: "live", current: { clicks: 6 }, previous: { clicks: 2 } },
      },
    });
    expect(response.body.result.isError).not.toBe(true);
  }
  expect(
    fetchMock.mock.calls.filter(([url]) => url.includes("oauth2.googleapis.com")),
  ).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("keeps a provider failure inside the JSON-RPC tool-error envelope", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("oauth2.googleapis.com")
        ? Response.json({ access_token: "fixture-access", expires_in: 3600 })
        : Response.json({}, { status: 429 }),
    ),
  );
  const response = await rpc(7, input);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ jsonrpc: "2.0", id: 7, result: { isError: true } });
});

it("refuses cross-project access before calling the provider", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const response = await rpc(8, { ...input, project_id: "prj_b00000000000000000000000" });
  expect(response.body.result.isError).toBe(true);
  expect(state.connection).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
