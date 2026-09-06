import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coverage: vi.fn(),
  counts: vi.fn(),
  prune: vi.fn(),
  queryRaw: vi.fn(),
  signals: vi.fn(),
  topQueries: vi.fn(),
  totals: vi.fn(),
  transaction: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw, $transaction: mocks.transaction },
}));
vi.mock("./counts", () => ({ getWindowCounts: mocks.counts }));
vi.mock("./coverage", () => ({ getQueryCoverage: mocks.coverage }));
vi.mock("./kpis", () => ({ getWindowTotals: mocks.totals }));
vi.mock("./signals", () => ({ getSearchInsightsSignals: mocks.signals }));
vi.mock("./top-rows", () => ({ getTopQueries: mocks.topQueries }));
vi.mock("./window-facts", async () => {
  const actual = await import("./window-facts");
  return {
    comparedWindowKey: actual.comparedWindowKey,
    DEFAULT_LENS_ROW_LIMIT: actual.DEFAULT_LENS_ROW_LIMIT,
    pruneWindowFactsToPair: mocks.prune,
    writeWindowFacts: mocks.write,
  };
});

const { computeWindowFacts, refreshWindowFacts } = await import("./window-facts-compute");

const key = {
  finalizedThrough: "2026-06-28",
  projectId: "internal_1",
  property: "sc-domain:example.com",
  windowDays: 7,
};

describe("window facts compute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.coverage.mockResolvedValue({
      calculable: true,
      capHitDays: 1,
      clicksShare: 60,
      impressionsShare: 40,
    });
    mocks.counts.mockResolvedValue({ queries: 1284 });
    mocks.signals.mockResolvedValue({ bandCount: 34, overlapCount: 12 });
    mocks.totals.mockResolvedValue({
      current: { clicks: 1200, ctr: 0.08, impressions: 15000, position: 12.4 },
      previous: { clicks: 1100, ctr: 0.075, impressions: 14600, position: 12.9 },
    });
    mocks.topQueries.mockResolvedValue({
      rows: [{ clicks: 90, ctr: 0.1, impressions: 900, position: 4.5, query: "corgi harness" }],
      total: 3820,
    });
    mocks.queryRaw.mockResolvedValue([{ days: 7n }]);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
    mocks.write.mockResolvedValue(undefined);
    mocks.prune.mockResolvedValue(0);
  });

  it("reads the default lens at a hundred rows, not the first view's fifty", async () => {
    await computeWindowFacts(key);
    expect(mocks.topQueries).toHaveBeenCalledWith(
      key.projectId,
      key.property,
      { end: "2026-06-28", start: "2026-06-22" },
      { limit: 100, offset: 0 },
    );
  });

  it("carries provenance for how many days actually held data", async () => {
    mocks.queryRaw.mockResolvedValue([{ days: 5n }]);
    await expect(computeWindowFacts(key)).resolves.toMatchObject({ coveredDays: 5 });
  });

  it("writes a window and its compared row inside one transaction", async () => {
    await refreshWindowFacts({ ...key, importId: "import_1", readyWindowDays: [7] });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const written = mocks.write.mock.calls.map(([input]) => input.finalizedThrough);
    expect(written).toEqual(["2026-06-28", "2026-06-21"]);
  });

  it("uses one transaction per window pair rather than one for the whole refresh", async () => {
    await refreshWindowFacts({ ...key, importId: "import_1", readyWindowDays: [7, 28, 90] });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
    expect(mocks.write).toHaveBeenCalledTimes(6);
  });

  it("leaves exactly the pair behind, pruning inside the same transaction that wrote it", async () => {
    await refreshWindowFacts({ ...key, importId: "import_1", readyWindowDays: [7] });
    expect(mocks.prune).toHaveBeenCalledTimes(1);
    expect(mocks.prune).toHaveBeenCalledWith(expect.objectContaining(key), expect.anything());
    // The prune runs after both writes, so the pair it keeps is already in the table.
    expect(mocks.write.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.prune.mock.invocationCallOrder[0],
    );
  });

  it("prunes each ready window separately rather than once for the refresh", async () => {
    await refreshWindowFacts({ ...key, importId: "import_1", readyWindowDays: [7, 28, 90] });
    const pruned = mocks.prune.mock.calls.map(([pruneKey]) => pruneKey.windowDays);
    expect(pruned).toEqual([7, 28, 90]);
  });

  it("writes nothing for a window the readiness gate has not opened", async () => {
    await refreshWindowFacts({ ...key, importId: "import_1", readyWindowDays: [7] });
    const days = mocks.write.mock.calls.map(([input]) => input.windowDays);
    expect(new Set(days)).toEqual(new Set([7]));
  });

  it("keeps going when one window fails, and names the one that did", async () => {
    mocks.signals.mockResolvedValueOnce({ bandCount: 1, overlapCount: 1 });
    mocks.signals.mockRejectedValueOnce(new Error("overlap timed out"));
    const result = await refreshWindowFacts({
      ...key,
      importId: "import_1",
      readyWindowDays: [7, 28],
    });
    expect(result.failed).toEqual([{ reason: "overlap timed out", windowDays: 7 }]);
    expect(result.written).toEqual([28]);
  });
});
