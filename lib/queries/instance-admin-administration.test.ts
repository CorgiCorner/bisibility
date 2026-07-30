import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstanceAdminAdministration } from "./instance-admin-administration";

const mocks = vi.hoisted(() => ({
  getInstanceAdminSession: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

type SqlCall = readonly [readonly string[], ...unknown[]];

function sqlText(call: SqlCall) {
  return call[0].join("?").replace(/\s+/g, " ").trim();
}

function sqlValues(call: SqlCall) {
  return call.slice(1);
}

function emptyQueries() {
  for (let index = 0; index < 6; index += 1) {
    mocks.queryRaw.mockResolvedValueOnce([]);
  }
}

const now = new Date("2026-07-18T12:34:56.000Z");

describe("getInstanceAdminAdministration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "admin_1" } });
  });

  it("gates the read model before any database query", async () => {
    mocks.getInstanceAdminSession.mockResolvedValueOnce(null);

    await expect(getInstanceAdminAdministration(now)).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("uses one UTC grouped query per growth model and pinned calendar boundaries", async () => {
    emptyQueries();

    await getInstanceAdminAdministration(now);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(6);
    const calls = mocks.queryRaw.mock.calls as unknown as SqlCall[];
    const growthCalls = calls.slice(0, 4);
    expect(growthCalls.map(sqlText)).toEqual(
      ["users", "projects", "keywords", "rank_checks"].map((table) =>
        expect.stringContaining(`FROM "${table}"`),
      ),
    );
    for (const call of growthCalls) {
      expect(sqlText(call)).toContain("AT TIME ZONE 'UTC'");
      expect(sqlText(call)).toContain("GROUP BY day");
      expect(sqlValues(call)).toEqual([
        new Date("2026-05-20T00:00:00.000Z"),
        new Date("2026-07-19T00:00:00.000Z"),
      ]);
    }
    expect(sqlValues(calls[4])).toEqual([
      new Date("2026-07-12T00:00:00.000Z"),
      new Date("2026-07-19T00:00:00.000Z"),
    ]);
    expect(sqlValues(calls[5])).toEqual([
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ]);
  });

  it("densifies 30 current days and computes deltas against the prior 30 days", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([
        { count: 2n, day: "2026-05-20" },
        { count: 3n, day: "2026-06-18" },
        { count: 1n, day: "2026-06-19" },
        { count: 4n, day: "2026-07-18" },
      ])
      .mockResolvedValueOnce([{ count: 2n, day: "2026-07-01" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 9n, day: "2026-07-18" }])
      .mockResolvedValueOnce([{ count: 7n }])
      .mockResolvedValueOnce([]);

    const result = await getInstanceAdminAdministration(now);

    expect(result.growth.users).toMatchObject({
      delta: 0,
      deltaPercent: 0,
      priorTotal: 5,
      total: 5,
    });
    expect(result.growth.users.points).toHaveLength(30);
    expect(result.growth.users.points[0]).toEqual({ count: 1, date: "2026-06-19" });
    expect(result.growth.users.points[1]).toEqual({ count: 0, date: "2026-06-20" });
    expect(result.growth.users.points[29]).toEqual({ count: 4, date: "2026-07-18" });
    expect(result.growth.projects).toMatchObject({ delta: 2, deltaPercent: null, total: 2 });
    expect(result.growth.keywords).toMatchObject({ delta: 0, deltaPercent: 0, total: 0 });
    expect(result.activeAccountsApprox).toBe(7);
  });

  it("computes project/provider reference usage without stored tenant cost fields", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([
        {
          billingUnits: 4,
          checks: 3n,
          projectId: "project_1",
          provider: "serpapi",
          requestedDepth: 100,
        },
        {
          billingUnits: null,
          checks: 2n,
          projectId: "project_1",
          provider: "dataforseo",
          requestedDepth: 10,
        },
        {
          billingUnits: null,
          checks: 1n,
          projectId: "project_2",
          provider: "dataforseo",
          requestedDepth: 100,
        },
      ]);

    const result = await getInstanceAdminAdministration(now);
    const consumptionSql = sqlText(mocks.queryRaw.mock.calls[5] as unknown as SqlCall).replace(
      /\s+/g,
      " ",
    );

    expect(consumptionSql).toContain('rc."checkedAt" >= ?');
    expect(consumptionSql).toContain("rc.status = 'completed'");
    expect(consumptionSql).toContain(
      'GROUP BY k."projectId", rc.provider, rc."requestedDepth", rc."billingUnits"',
    );
    expect(consumptionSql).not.toContain("costCents");
    expect(consumptionSql).not.toContain("estimatedCostCents");
    expect(result.topConsumption).toHaveLength(3);
    expect(result.topConsumption[0]).toMatchObject({
      billableUnits: 12,
      checks: 3,
      projectId: "project_1",
      provider: "serpapi",
      referenceCostCents: 12,
    });
    expect(result.topConsumption[0]?.sharePercent).toBeCloseTo(86.02, 2);
    expect(result.topConsumption[1]).toMatchObject({
      billableUnits: 1,
      checks: 1,
      projectId: "project_2",
      provider: "dataforseo",
      referenceCostCents: 1.55,
    });
    expect(result.topConsumption[2]).toMatchObject({
      billableUnits: 2,
      checks: 2,
      projectId: "project_1",
      provider: "dataforseo",
      referenceCostCents: 0.4,
    });
  });

  it("does not expose tenant content or account identity fields", async () => {
    emptyQueries();

    const result = await getInstanceAdminAdministration(now);
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      '"email"',
      '"name"',
      '"domain"',
      '"keywordId"',
      '"keywordText"',
      '"userId"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
