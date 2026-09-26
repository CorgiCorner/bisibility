import { ProviderAuthError } from "@/lib/providers/auth-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSearchPerformanceQueryStats,
  listTrafficSnapshots,
  syncProjectTrafficApi,
} from "./analytics";
import type { ApiContext } from "./context";

const projectPublicId = "prj_a00000000000000000000000";
const connectionPublicId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  fetchQueryStats: vi.fn(),
  getProvider: vi.fn(),
  markReauth: vi.fn(),
  prisma: {
    pageTrafficSnapshot: { count: vi.fn(), findMany: vi.fn() },
    providerConnection: { findMany: vi.fn() },
  },
  runtimeCredentials: vi.fn(),
  syncNow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.markReauth }));
vi.mock("@/lib/providers/registry", () => ({ getAnalyticsProvider: mocks.getProvider }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: mocks.runtimeCredentials,
}));
vi.mock("@/lib/traffic/sync-now", () => ({ syncProjectTrafficNow: mocks.syncNow }));

function context(method: string, search = "") {
  const url = new URL(
    `https://example.test/api/v1/projects/${projectPublicId}/analytics/test${search}`,
  );
  return {
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: projectPublicId } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: [],
    req: new Request(url, { method }),
    url,
  } as unknown as ApiContext;
}

describe("analytics REST endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.pageTrafficSnapshot.findMany.mockResolvedValue([
      {
        bounceRate: null,
        createdAt: new Date("2026-06-30T01:00:00.000Z"),
        date: new Date("2026-06-30T00:00:00.000Z"),
        engagementRate: 0.7,
        id: "snapshot_1",
        keyEvents: 3,
        path: "/pricing",
        projectId: "project_1",
        provider: "ga4",
        scrollDepth: 60,
        sessions: 40,
        updatedAt: new Date("2026-06-30T01:00:00.000Z"),
        visitDurationSeconds: 80,
        visitors: 32,
        windowDays: 28,
      },
    ]);
    mocks.prisma.pageTrafficSnapshot.count.mockResolvedValue(1);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: "encrypted",
        id: "connection_1",
        provider: "gsc",
        publicId: connectionPublicId,
      },
    ]);
    mocks.getProvider.mockReturnValue({
      fetchQueryStats: mocks.fetchQueryStats,
      id: "gsc",
      label: "Google Search Console",
    });
    mocks.runtimeCredentials.mockReturnValue({ apiKey: "secret" });
    mocks.fetchQueryStats.mockResolvedValue([
      { clicks: 10, ctr: 0.1, impressions: 100, position: 4.2, query: "rank tracker" },
    ]);
    mocks.syncNow.mockResolvedValue({
      connections: 1,
      keywordSnapshots: 2,
      pageSnapshots: 3,
      projectId: "project_1",
      runs: [
        {
          connectionId: "connection_1",
          provider: "gsc",
          rowsFetched: 3,
          rowsMatched: 2,
          rowsUpserted: 1,
          status: "succeeded_with_data",
          truncated: false,
        },
      ],
      skipped: [],
    });
  });

  it("lists stored page snapshots with date, path, and offset filters", async () => {
    const response = await listTrafficSnapshots(
      context(
        "GET",
        "?start_date=2026-06-01&end_date=2026-06-30&path=%2Fpricing&limit=25&offset=50",
      ),
      projectPublicId,
    );
    const body = await response.json();
    expect(body).toMatchObject({
      offset: 50,
      rows: [{ date: "2026-06-30", engagement_rate: 0.7, path: "/pricing" }],
      total_count: 1,
    });
    expect(body.rows[0]).not.toHaveProperty("id");
    expect(body.rows[0]).not.toHaveProperty("project_id");
    expect(mocks.prisma.pageTrafficSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ id: true, projectId: true }),
        skip: 50,
        take: 25,
        where: expect.objectContaining({ projectId: "project_1" }),
      }),
    );
  });

  it("rejects invalid snapshot ranges before database access", async () => {
    await expect(
      listTrafficSnapshots(
        context("GET", "?start_date=2026-07-01&end_date=2026-06-01"),
        projectPublicId,
      ),
    ).rejects.toThrow();
    expect(mocks.prisma.pageTrafficSnapshot.findMany).not.toHaveBeenCalled();
  });

  it("fetches live query stats through the selected eligible connection", async () => {
    const response = await listSearchPerformanceQueryStats(
      context(
        "GET",
        `?start_date=2026-06-01&end_date=2026-06-30&connection_id=${connectionPublicId}&query=rank&limit=50`,
      ),
      projectPublicId,
    );
    await expect(response.json()).resolves.toMatchObject({
      connection: { id: connectionPublicId, provider: "gsc" },
      result: { row_cap: 50, rows_returned: 1, sort: "clicks_desc", truncated: false },
      rows: [{ clicks: 10, query: "rank tracker" }],
      scope: {
        country: null,
        device: null,
        dimensions: ["query"],
        end_date: "2026-06-30",
        page_path: null,
        query_match: "equals",
        start_date: "2026-06-01",
      },
    });
    expect(mocks.fetchQueryStats).toHaveBeenCalledWith(
      { apiKey: "secret" },
      expect.objectContaining({ endDate: "2026-06-30", limit: 50, query: "rank" }),
    );
  });

  it("maps page_path and query_match inputs onto the provider call", async () => {
    mocks.fetchQueryStats.mockResolvedValue([
      {
        clicks: 5,
        ctr: 0.1,
        impressions: 50,
        page: "https://example.com/blog/post",
        position: 3.1,
        query: "seo api",
      },
    ]);
    const response = await listSearchPerformanceQueryStats(
      context(
        "GET",
        "?start_date=2026-06-01&end_date=2026-06-30&page_path=%2Fblog%2F&page_path_match=prefix&query=seo&query_match=contains&clicks_min=2&impressions_min=10&position_max=8",
      ),
      projectPublicId,
    );
    const body = await response.json();
    expect(mocks.fetchQueryStats).toHaveBeenCalledWith(
      { apiKey: "secret" },
      expect.objectContaining({
        clicks: { min: 2 },
        impressions: { min: 10 },
        pagePath: { match: "prefix", value: "/blog/" },
        position: { max: 8 },
        query: "seo",
        queryMatch: "contains",
      }),
    );
    expect(body.scope).toMatchObject({
      dimensions: ["query", "page"],
      page_path: "/blog/",
      query_match: "contains",
    });
    expect(body.rows[0]).toHaveProperty("page", "https://example.com/blog/post");
  });

  it("maps the default and the explicit contains page_path_match to the contains filter", async () => {
    await listSearchPerformanceQueryStats(
      context("GET", "?start_date=2026-06-01&end_date=2026-06-30&page_path=%2Fdocs%2F"),
      projectPublicId,
    );
    expect(mocks.fetchQueryStats).toHaveBeenCalledWith(
      { apiKey: "secret" },
      expect.objectContaining({ pagePath: { match: "contains", value: "/docs/" } }),
    );

    await listSearchPerformanceQueryStats(
      context(
        "GET",
        "?start_date=2026-06-01&end_date=2026-06-30&page_path=%2Fdocs%2F&page_path_match=contains",
      ),
      projectPublicId,
    );
    expect(mocks.fetchQueryStats).toHaveBeenLastCalledWith(
      { apiKey: "secret" },
      expect.objectContaining({ pagePath: { match: "contains", value: "/docs/" } }),
    );
  });

  it("marks the result truncated exactly when the source returned the row cap", async () => {
    mocks.fetchQueryStats.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        clicks: index,
        ctr: 0.1,
        impressions: 10,
        position: 1,
        query: `q${index}`,
      })),
    );
    const capped = await listSearchPerformanceQueryStats(
      context("GET", "?start_date=2026-06-01&end_date=2026-06-30"),
      projectPublicId,
    );
    await expect(capped.json()).resolves.toMatchObject({
      result: { row_cap: 100, rows_returned: 100, sort: "clicks_desc", truncated: true },
    });

    mocks.fetchQueryStats.mockResolvedValue([
      { clicks: 10, ctr: 0.1, impressions: 100, position: 4.2, query: "rank tracker" },
    ]);
    const short = await listSearchPerformanceQueryStats(
      context("GET", "?start_date=2026-06-01&end_date=2026-06-30&limit=5"),
      projectPublicId,
    );
    await expect(short.json()).resolves.toMatchObject({
      result: { row_cap: 5, rows_returned: 1, sort: "clicks_desc", truncated: false },
    });
  });

  it("returns not found when no query-capable source is eligible", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    const response = await listSearchPerformanceQueryStats(
      context("GET", "?start_date=2026-06-01&end_date=2026-06-30"),
      projectPublicId,
    );
    expect(response.status).toBe(404);
  });

  it("marks provider authorization failures for reconnect", async () => {
    mocks.fetchQueryStats.mockRejectedValue(new ProviderAuthError("gsc"));
    const response = await listSearchPerformanceQueryStats(
      context("GET", "?start_date=2026-06-01&end_date=2026-06-30"),
      projectPublicId,
    );
    expect(response.status).toBe(422);
    expect(mocks.markReauth).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_1", projectId: "project_1" }),
    );
  });

  it("runs the shared audited sync core", async () => {
    const response = await syncProjectTrafficApi(context("POST"), projectPublicId);
    const body = await response.json();
    expect(body).toMatchObject({
      keyword_snapshots: 2,
      project_id: projectPublicId,
      runs: [{ connection_id: connectionPublicId }],
    });
    expect(JSON.stringify(body)).not.toContain("project_1");
    expect(JSON.stringify(body)).not.toContain("connection_1");
    expect(mocks.syncNow).toHaveBeenCalledWith({ actorId: "user_1", projectId: "project_1" });
  });
});
