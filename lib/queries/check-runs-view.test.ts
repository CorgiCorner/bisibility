import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRunRowsWhere, getCheckRunsView } from "./check-runs-view";

const mocks = vi.hoisted(() => ({
  getRequestSerpProviderChain: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    rankCheck: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./workspace-request-data", () => ({
  getRequestSerpProviderChain: mocks.getRequestSerpProviderChain,
}));

const NOW = new Date("2026-07-24T12:00:00.000Z");
const RANGE_START = new Date("2026-07-17T12:00:00.000Z");

function row(publicId: string) {
  return {
    attemptCount: 1,
    attempts: null,
    checkedAt: new Date("2026-07-24T10:00:00.000Z"),
    costCents: 0.2,
    degradedToCountry: false,
    error: null,
    estimatedCostCents: null,
    finishedAt: new Date("2026-07-24T10:00:02.000Z"),
    publicId,
    keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx", text: "rank tracker" },
    position: 4,
    previousPosition: 6,
    provider: "serpapi",
    requestedDepth: 10,
    startedAt: new Date("2026-07-24T10:00:00.000Z"),
    status: "completed",
    trigger: "manual",
    viaFallback: true,
  };
}

describe("check runs view query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.getRequestSerpProviderChain.mockResolvedValue([
      { provider: "dataforseo" },
      { provider: "serpapi" },
    ]);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([row("check_1")]);
    mocks.prisma.rankCheck.count.mockResolvedValue(1);
    mocks.prisma.rankCheck.groupBy
      .mockResolvedValueOnce([
        { _count: { _all: 2 }, status: "completed" },
        { _count: { _all: 1 }, status: "failed" },
      ])
      .mockResolvedValueOnce([{ _count: { _all: 1 }, provider: "serpapi", viaFallback: true }]);
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ total: "0.5" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attempts: [{ message: "Provider rate limited (429)", provider: "dataforseo" }],
          provider: "serpapi",
          status: "completed",
        },
      ]);
  });

  it.each([
    ["all", { status: { in: ["completed", "failed", "running"] } }],
    ["completed", { status: "completed" }],
    ["failed", { status: "failed" }],
    ["running", { status: "running" }],
    ["deferred", { status: "deferred" }],
    ["fallback", { status: "completed", viaFallback: true }],
  ] as const)("pushes the %s status filter into the database where", (status, expected) => {
    expect(checkRunRowsWhere("project_1", RANGE_START, NOW, { status })).toEqual(
      expect.objectContaining(expected),
    );
  });

  it("pushes provider, trigger, and compound cursor filters into a bounded page query", async () => {
    const cursor = { checkedAt: "2026-07-24T10:00:00.000Z", id: "check_mabcdefghijklmnopqrstuvw" };
    const view = await getCheckRunsView("prj_abcdefghijklmnopqrstuvwx", {
      cursor,
      limit: 50,
      now: NOW,
      provider: "serpapi",
      range: "7d",
      status: "fallback",
      trigger: "manual",
    });

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        where: {
          OR: [
            { checkedAt: { lt: new Date(cursor.checkedAt) } },
            { checkedAt: new Date(cursor.checkedAt), publicId: { lt: cursor.id } },
          ],
          checkedAt: { gte: RANGE_START, lte: NOW },
          keyword: { projectId: "project_1" },
          provider: "serpapi",
          status: "completed",
          trigger: "manual",
          viaFallback: true,
        },
      }),
    );
    expect(view).toMatchObject({
      counts: { completed: 2, failed: 1, runs: 3, viaFallback: 1 },
      spendCents: 0.5,
    });
  });
});
