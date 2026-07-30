import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCheckHealth } from "./check-health";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    providerConnection: {
      findFirst: vi.fn(),
    },
    providerCostEntry: {
      aggregate: vi.fn(),
    },
    rankCheck: {
      aggregate: vi.fn(),
    },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

const now = new Date("2026-07-14T12:00:00.000Z");
const project = { budgetCapCents: 500, id: "project_1", publicId: "prj_1" };

describe("check health query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        failedCount: 0,
        latestCheckedAt: null,
        latestError: null,
        latestKeyword: null,
        latestProvider: null,
        runningCount: 0,
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
  });

  it("returns budget, failed-check, and running-check state for a readable project", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 500 } });
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        failedCount: 2,
        latestCheckedAt: new Date("2026-07-14T11:30:00.000Z"),
        latestError: "Provider request failed.",
        latestKeyword: "headless cms",
        latestProvider: "dataforseo",
        runningCount: 1,
      },
    ]);

    const result = await getCheckHealth("prj_1", { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(result).toEqual({
      budget: { capCents: 500, exhausted: true, spentCents: 500 },
      failed24h: {
        count: 2,
        latest: {
          checkedAt: "2026-07-14T11:30:00.000Z",
          error: "Provider request failed.",
          keyword: "headless cms",
          provider: "dataforseo",
        },
      },
      providerConnected: false,
      providerRate: { overrideCents: null, providerId: null },
      runningCount: 1,
    });
  });

  it("scopes every rank-check read to the authorized project id", async () => {
    await getCheckHealth("prj_1", { now });

    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keyword: { projectId: "project_1" } }),
      }),
    );
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      "project_1",
      new Date("2026-07-13T12:00:00.000Z"),
      new Date("2026-07-13T12:00:00.000Z"),
    ]);
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: { costPerCheckCents: true, id: true, provider: true },
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
  });

  it("reports whether a connected SERP provider can run checks", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0.25,
      id: "provider_1",
      provider: "dataforseo",
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      providerConnected: true,
      providerRate: { overrideCents: 0.25, providerId: "dataforseo" },
    });
  });

  it("preserves an explicit zero-cost provider rate", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0,
      id: "provider_local",
      provider: "local-sequence",
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      providerConnected: true,
      providerRate: { overrideCents: 0, providerId: "local-sequence" },
    });
  });

  it("keeps budget available when monthly spend is below the cap", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 125 } });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      budget: { capCents: 500, exhausted: false, spentCents: 125 },
      failed24h: { count: 0, latest: null },
      runningCount: 0,
    });
  });
});
