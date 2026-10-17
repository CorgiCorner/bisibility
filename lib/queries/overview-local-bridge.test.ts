import { aggregateLocalRows } from "@/lib/dashboard-local/aggregate";
import { localFixtureSelection } from "@/lib/dashboard-local/test-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverview } from "./overview";

const mocks = vi.hoisted(() => ({
  tx: {
    $executeRaw: vi.fn(),
    keyword: { count: vi.fn() },
    rankCheck: { findMany: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  transaction: vi.fn(),
  local: vi.fn(),
  metrics: vi.fn(),
  options: vi.fn(),
  ledger: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/dashboard-local/read", () => ({ readLocalReportInTransaction: mocks.local }));
vi.mock("./overview-data", () => ({ loadOverviewMetricData: mocks.metrics }));
vi.mock("./rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.options,
}));
vi.mock("./rank-check-run-accounting", () => ({ rankCheckLedgerActuals: mocks.ledger }));
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    actor: { id: "verified-session" },
    project: {
      id: "internal-project",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      name: "Fixture",
      domain: "example.test",
      writeMode: "active",
    },
  }),
}));
vi.mock("@/lib/providers/analytics/google-client", () => ({
  isGoogleOAuthConfigured: () => false,
}));
const at = new Date("2026-10-12T12:00:00.000Z");

describe("Local overview transaction and exact cohort bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((read) => read(mocks.tx));
    mocks.options.mockResolvedValue({
      asOf: at,
      limits: { maxTargets: 10, maxItems: 100, maxChecks: 100 },
    });
    mocks.local.mockResolvedValue({
      ...aggregateLocalRows([], at),
      rows: [],
      asOf: at.toISOString(),
    });
    mocks.metrics.mockResolvedValue({
      addedThisMonth: 0,
      filteredKeywordCount: 0,
      eligibleTargetCount: 0,
      keywordVolumes: new Map(),
      keywords: [],
      latestCheck: null,
      marketKeywords: [],
      projectMarkets: [],
      projectDefaults: null,
    });
    mocks.tx.providerConnection.findMany.mockResolvedValue([]);
    mocks.tx.rankCheck.findMany.mockResolvedValue([]);
    mocks.tx.tag.findMany.mockResolvedValue([]);
    mocks.ledger.mockResolvedValue(new Map());
  });
  it("uses the same READ ONLY RepeatableRead transaction for Local, organic metrics, monthly checks and ledger", async () => {
    const result = await getOverview("prj_abcdefghijklmnopqrstuvwx", {
      localSelection: localFixtureSelection,
      now: at,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 2_000,
      timeout: 15_000,
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.local).toHaveBeenCalledWith(
      mocks.tx,
      "prj_abcdefghijklmnopqrstuvwx",
      { actor: { id: "verified-session" } },
      localFixtureSelection,
      expect.any(Object),
      expect.objectContaining({ asOf: at }),
    );
    expect(mocks.metrics).toHaveBeenCalledWith(
      "internal-project",
      expect.any(Object),
      at,
      expect.objectContaining({ tx: mocks.tx, keywordIds: [] }),
    );
    expect(mocks.tx.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keyword: expect.objectContaining({ publicId: { in: [] } }),
        }),
      }),
    );
    expect(mocks.ledger).toHaveBeenCalledWith("internal-project", [], mocks.tx);
    expect(mocks.tx.keyword.count).not.toHaveBeenCalled();
    expect(result.localReport).toBeDefined();
  });
  it("does not run General queries if the Local assignment has become unavailable", async () => {
    mocks.local.mockRejectedValue(Object.assign(new Error("unavailable"), { status: 404 }));
    await expect(
      getOverview("prj_abcdefghijklmnopqrstuvwx", {
        localSelection: localFixtureSelection,
        now: at,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.metrics).not.toHaveBeenCalled();
    expect(mocks.tx.rankCheck.findMany).not.toHaveBeenCalled();
    expect(mocks.ledger).not.toHaveBeenCalled();
  });
});
