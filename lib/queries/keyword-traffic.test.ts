import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordTraffic } from "./keyword-traffic";

const mocks = vi.hoisted(() => ({
  prisma: {
    keywordTrafficSnapshot: { findMany: vi.fn() },
    pageTrafficSnapshot: { findMany: vi.fn() },
    providerConnection: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("keyword traffic query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.keywordTrafficSnapshot.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
  });

  it("exposes a connected analytics provider even before the first snapshot", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        priority: 0,
        provider: "gsc",
      },
    ]);

    await expect(
      getKeywordTraffic("project_1", "keyword_1", { rankingUrl: null, targetUrl: null }),
    ).resolves.toEqual({
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: true,
      pages: [],
      query: null,
    });
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: { priority: true, provider: true },
      where: {
        enabled: true,
        kind: "analytics",
        projectId: "project_1",
        status: "connected",
      },
    });
  });

  it("distinguishes a non-Search-Console analytics connection", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([{ priority: 0, provider: "ga4" }]);

    await expect(
      getKeywordTraffic("project_1", "keyword_1", { rankingUrl: null, targetUrl: null }),
    ).resolves.toMatchObject({
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: false,
    });
  });
});
