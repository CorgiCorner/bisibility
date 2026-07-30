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
      rows: [{ clicks: 10, query: "rank tracker" }],
    });
    expect(mocks.fetchQueryStats).toHaveBeenCalledWith(
      { apiKey: "secret" },
      expect.objectContaining({ endDate: "2026-06-30", limit: 50, query: "rank" }),
    );
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
