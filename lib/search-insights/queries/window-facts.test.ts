import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchInsightsWindowFacts: {
      deleteMany: mocks.deleteMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
    },
  },
}));
const {
  comparedWindowKey,
  markWindowFactsStale,
  pruneWindowFactsToPair,
  readWindowFacts,
  writeWindowFacts,
} = await import("./window-facts");

const key = {
  finalizedThrough: "2026-06-28",
  projectId: "internal_1",
  property: "sc-domain:example.com",
  windowDays: 7,
};

const facts = {
  counts: { queries: 1284 },
  coverage: { calculable: true, capHitDays: 2, clicksShare: 61, impressionsShare: 44 },
  defaultLensQueries: {
    rows: [{ clicks: 90, ctr: 0.1, impressions: 900, position: 4.5, query: "corgi harness" }],
    total: 3820,
  },
  signals: { bandCount: 34, overlapCount: 12 },
  totals: {
    current: { clicks: 1200, ctr: 0.08, impressions: 15000, position: 12.4 },
    previous: { clicks: 1100, ctr: 0.075, impressions: 14600, position: 12.9 },
  },
};

describe("window facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns a stored row as a hit", async () => {
    mocks.findUnique.mockResolvedValue({ ...facts, stale: false });
    await expect(readWindowFacts(key)).resolves.toEqual({ facts, kind: "hit" });
  });

  it("never serves a stale row, because a gap filled inside the window changed it", async () => {
    mocks.findUnique.mockResolvedValue({ ...facts, stale: true });
    await expect(readWindowFacts(key)).resolves.toEqual({ kind: "miss", reason: "stale" });
  });

  it("recomputes rather than serving a payload of an older shape", async () => {
    mocks.findUnique.mockResolvedValue({
      ...facts,
      signals: { bandCount: 34 },
      stale: false,
    });
    await expect(readWindowFacts(key)).resolves.toEqual({ kind: "miss", reason: "malformed" });
  });

  it("reports an absent row and an unreadable one as different misses", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(readWindowFacts(key)).resolves.toEqual({ kind: "miss", reason: "absent" });

    mocks.findUnique.mockRejectedValueOnce(new Error("connection lost"));
    await expect(readWindowFacts(key)).resolves.toEqual({ kind: "miss", reason: "unreadable" });
  });

  it("records every miss under one event name so the rate is observable", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.findUnique.mockResolvedValue(null);
    await readWindowFacts(key);
    expect(info).toHaveBeenCalledWith(
      "[search-insights] window_facts_miss",
      expect.objectContaining({ reason: "absent", windowDays: 7 }),
    );
  });

  it("does not write from the read path", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await readWindowFacts(key);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("puts the compared window in its own row, ending the day before this one starts", () => {
    expect(comparedWindowKey(key)).toEqual({ ...key, finalizedThrough: "2026-06-21" });
    expect(comparedWindowKey({ ...key, windowDays: 90 })).toEqual({
      ...key,
      finalizedThrough: "2026-03-30",
      windowDays: 90,
    });
  });

  it("clears stale when it writes, because the row was just recomputed", async () => {
    mocks.upsert.mockResolvedValue({});
    await writeWindowFacts({ ...key, coveredDays: 7, facts, importId: "import_1" });
    const call = mocks.upsert.mock.calls[0]?.[0];
    expect(call.create).toMatchObject({ coveredDays: 7, importId: "import_1", stale: false });
    expect(call.update).toMatchObject({ stale: false });
  });

  it("marks rows stale across the widest window rather than missing one", async () => {
    mocks.updateMany.mockResolvedValue({ count: 5 });
    await expect(
      markWindowFactsStale({
        from: "2026-06-01",
        projectId: "internal_1",
        property: "sc-domain:example.com",
        to: "2026-06-10",
        widestWindowDays: 90,
      }),
    ).resolves.toBe(5);
    const where = mocks.updateMany.mock.calls[0]?.[0].where;
    expect(where.stale).toBe(false);
    expect(where.finalizedThrough.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    // A row whose window still covers 2026-06-10 can end up to 90 days later.
    expect(where.finalizedThrough.lte).toEqual(new Date("2026-09-08T00:00:00.000Z"));
  });

  it("keeps only the current pair and deletes every older boundary", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    await expect(pruneWindowFactsToPair(key)).resolves.toBe(3);
    const where = mocks.deleteMany.mock.calls[0]?.[0].where;
    expect(where.finalizedThrough.notIn).toEqual([
      new Date("2026-06-28T00:00:00.000Z"),
      new Date("2026-06-21T00:00:00.000Z"),
    ]);
  });

  it("prunes one window length only, so a concurrent refresh cannot lose another pair", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await pruneWindowFactsToPair({ ...key, windowDays: 28 });
    const where = mocks.deleteMany.mock.calls[0]?.[0].where;
    expect(where.windowDays).toBe(28);
    expect(where.projectId).toBe("internal_1");
    expect(where.property).toBe("sc-domain:example.com");
    expect(where.searchType).toBe("web");
  });
});
