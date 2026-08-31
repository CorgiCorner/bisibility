import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { getOrganicSessionsTotals, getWindowTotals } = await import("./kpis");

const window = {
  current: { end: "2026-07-08", start: "2026-06-11" },
  previous: { end: "2026-06-10", start: "2026-05-14" },
};

function statement() {
  return mocks.prisma.$queryRaw.mock.calls[0]?.[0];
}

describe("getWindowTotals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      { bucket: "current", clicks: 12_480n, impressions: 486_310n, positionWeight: 8_948_104 },
      { bucket: "previous", clicks: 11_534n, impressions: 471_690n, positionWeight: 9_433_800 },
    ]);
  });

  it("reads the aggregate table only, so a truncated query table cannot lower a headline", async () => {
    await getWindowTotals("project_1", "sc-domain:example.com", window);

    expect(statement().sql).toContain('FROM "search_analytics_daily"');
    expect(statement().sql).not.toContain("search_analytics_query_daily");
  });

  it("splits the compared blocks by date in one pass over the spanning range", async () => {
    await getWindowTotals("project_1", "sc-domain:example.com", window);

    // The previous block ends the day before the current one begins, so one scan answers both.
    expect(statement().values).toEqual([
      "2026-06-11",
      "project_1",
      "sc-domain:example.com",
      "web",
      "2026-05-14",
      "2026-07-08",
    ]);
  });

  it("returns both blocks as window ratios", async () => {
    const totals = await getWindowTotals("project_1", "sc-domain:example.com", window);

    expect(totals.current.clicks).toBe(12_480);
    expect(totals.previous.clicks).toBe(11_534);
    expect(totals.current.position).toBeCloseTo(18.4, 1);
    expect(totals.previous.position).toBeCloseTo(20, 1);
  });

  it("reports an empty compared block rather than failing on a property with no history", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      { bucket: "current", clicks: 5n, impressions: 100n, positionWeight: 1_000 },
    ]);

    const totals = await getWindowTotals("project_1", "sc-domain:example.com", window);

    expect(totals.previous).toEqual({ clicks: 0, ctr: 0, impressions: 0, position: 0 });
  });
});

describe("getOrganicSessionsTotals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      { bucket: "current", sessions: 9_120n },
      { bucket: "previous", sessions: 8_004n },
    ]);
  });

  it("splits sessions from the daily sessions table over the same compared span", async () => {
    await expect(getOrganicSessionsTotals("project_1", "123456789", window)).resolves.toEqual({
      current: 9_120,
      previous: 8_004,
    });
    expect(statement().sql).toContain('FROM "organic_sessions_daily"');
    expect(statement().values).toEqual([
      "2026-06-11",
      "project_1",
      "123456789",
      "2026-05-14",
      "2026-07-08",
    ]);
  });
});
