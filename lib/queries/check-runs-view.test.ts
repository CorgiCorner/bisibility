import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRunRowsWhere, getCheckRunsView } from "./check-runs-view";

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(async () => new Map()),
  actuals: vi.fn(async () => new Map()),
  triggerWhere: vi.fn(async (_project: string, trigger: string) =>
    trigger && trigger !== "all" ? { trigger } : {},
  ),
  getRequestSerpProviderChain: vi.fn(),
  storedResultsSummaries: vi.fn(async () => new Map()),
  prisma: {
    $queryRaw: vi.fn(),
    keyword: {
      count: vi.fn(),
    },
    rankCheck: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/provider-evidence/projection/read", () => ({ readCheckEvidence: mocks.evidence }));
vi.mock("@/lib/queries/rank-check-run-accounting", () => ({
  rankCheckLedgerActuals: mocks.actuals,
  ledgerActualCostCents: (
    actual: { receiptCount: number; costCents: number | null } | undefined,
  ) => (actual?.receiptCount ? actual.costCents : null),
}));
vi.mock("./check-run-trigger", () => ({ checkRunTriggerWhere: mocks.triggerWhere }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/retrieved-results", () => ({
  storedResultsSummaries: mocks.storedResultsSummaries,
}));
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
    id: `internal_${publicId}`,
    keyword: {
      publicId: "kw_abcdefghijklmnopqrstuvwx",
      text: "rank tracker",
      device: "desktop",
      locationRef: {
        countryCode: "US",
        displayName: "San Francisco, California, US",
        languageCode: "en",
        languageLabel: "English",
      },
    },
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
    mocks.prisma.rankCheck.findMany.mockImplementation(async (args) =>
      args.select?.deferredReason
        ? [row("stat1"), row("stat2"), { ...row("stat3"), viaFallback: false, status: "failed" }]
        : [row("check_1")],
    );
    mocks.prisma.keyword.count.mockResolvedValue(2);
    mocks.prisma.rankCheck.count.mockResolvedValue(1);
    mocks.prisma.rankCheck.groupBy
      .mockResolvedValueOnce([
        { _count: { _all: 2 }, status: "completed" },
        { _count: { _all: 1 }, status: "failed" },
      ])
      .mockResolvedValueOnce([{ _count: { _all: 1 }, provider: "serpapi", viaFallback: true }]);
    mocks.prisma.$queryRaw.mockReset().mockResolvedValue([{ total: "0.5" }]);
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

  it("uses confirmed ledger cost for failed checks and preserves unknown cost", async () => {
    mocks.prisma.rankCheck.findMany.mockImplementation(async (args) =>
      args.select?.deferredReason
        ? []
        : [
            { ...row("charged"), status: "failed" },
            { ...row("unknown"), status: "failed" },
          ],
    );
    mocks.actuals.mockResolvedValueOnce(
      new Map([["internal_charged", { receiptCount: 1, costCents: 0.12 }]]),
    );
    const view = await getCheckRunsView("project", { now: NOW });
    expect(view.rows.map((item) => item.costCents)).toEqual([0.12, null]);
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
          AND: [
            {
              OR: [
                { checkedAt: { lt: new Date(cursor.checkedAt) } },
                { checkedAt: new Date(cursor.checkedAt), publicId: { lt: cursor.id } },
              ],
              checkedAt: { gte: RANGE_START, lte: NOW },
              keyword: { projectId: "project_1" },
              provider: "serpapi",
              status: "completed",
              viaFallback: true,
            },
            { trigger: "manual" },
            {},
            {},
          ],
        },
      }),
    );
    expect(view).toMatchObject({
      counts: { completed: 2, failed: 1, runs: 3, viaFallback: 2 },
      spendCents: 0.5,
      staleCount: 2,
    });
  });

  it("counts stale keywords outside the selected range, filters, and result page", async () => {
    await getCheckRunsView("prj_abcdefghijklmnopqrstuvwx", {
      cursor: { checkedAt: "2026-07-24T10:00:00.000Z", id: "check_mabcdefghijklmnopqrstuvw" },
      limit: 1,
      now: NOW,
      provider: "serpapi",
      range: "24h",
      status: "failed",
      trigger: "manual",
    });

    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: {
        dispatchState: { isNot: null },
        projectId: "project_1",
        rankChecks: {
          none: {
            checkedAt: { gte: new Date("2026-07-22T12:00:00.000Z") },
            status: "completed",
          },
          some: {
            checkedAt: { lt: new Date("2026-07-22T12:00:00.000Z") },
            status: "completed",
          },
        },
      },
    });
  });

  it("maps distinct (location, device) pairs for the same keyword text across markets", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        ...row("check_a"),
        publicId: "check_a",
        keyword: {
          publicId: "kw_sf",
          text: "rank tracker",
          device: "desktop",
          locationRef: {
            countryCode: "US",
            displayName: "San Francisco, CA, US",
            languageCode: "en",
            languageLabel: "English",
          },
        },
      },
      {
        ...row("check_b"),
        publicId: "check_b",
        keyword: {
          publicId: "kw_sf_mobile",
          text: "rank tracker",
          device: "mobile",
          locationRef: {
            countryCode: "US",
            displayName: "San Francisco, CA, US",
            languageCode: "en",
            languageLabel: "English",
          },
        },
      },
      {
        ...row("check_c"),
        publicId: "check_c",
        keyword: {
          publicId: "kw_lon",
          text: "rank tracker",
          device: "desktop",
          locationRef: {
            countryCode: "GB",
            displayName: "London, UK",
            languageCode: "en",
            languageLabel: "English",
          },
        },
      },
      {
        ...row("check_d"),
        publicId: "check_d",
        keyword: {
          publicId: "kw_lon_mobile",
          text: "rank tracker",
          device: "mobile",
          locationRef: {
            countryCode: "GB",
            displayName: "London, UK",
            languageCode: "en",
            languageLabel: "English",
          },
        },
      },
    ]);

    const view = await getCheckRunsView("prj_abcdefghijklmnopqrstuvwx", { now: NOW });

    const pairs = view.rows.map((r) => ({ location: r.location, device: r.device }));
    expect(pairs).toEqual([
      { location: "San Francisco, CA, US", device: "desktop" },
      { location: "San Francisco, CA, US", device: "mobile" },
      { location: "London, UK", device: "desktop" },
      { location: "London, UK", device: "mobile" },
    ]);
    const distinct = new Set(pairs.map((p) => `${p.location}|${p.device}`));
    expect(distinct.size).toBe(4);
  });

  it("attaches stored-results summaries so a completed run can expand", async () => {
    // Without this the checks table can never expand a completed run: storedResults would
    // be undefined on every row and the whole surface would be unreachable in production.
    mocks.storedResultsSummaries.mockResolvedValue(
      new Map([
        [
          "check_1",
          {
            fullDetailUntil: null,
            requestedDepth: 100,
            retrievedPositions: 22,
            stoppedAtResult: true,
            tier: "full" as const,
          },
        ],
      ]),
    );

    const view = await getCheckRunsView("prj_1", {});

    expect(view.rows[0]?.storedResults?.tier).toBe("full");
    expect(mocks.storedResultsSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1" }),
    );
  });
});
