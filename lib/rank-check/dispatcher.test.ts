import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimDueRankChecks } from "./dispatcher";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

const now = new Date("2026-07-28T12:00:00.000Z");

function row(keywordId: string, overrides: Record<string, unknown> = {}) {
  return {
    anchorCheckAt: null,
    cronExpression: null,
    device: "desktop",
    domain: "example.com",
    dueCheckAt: new Date("2026-07-28T11:00:00.000Z"),
    frequency: "daily",
    jitterMinutes: 0,
    keywordId,
    locationId: "location_1",
    projectId: "project_1",
    timezone: "UTC",
    ...overrides,
  };
}

function sqlText(call: unknown[]) {
  return String((call[0] as { sql?: string } | undefined)?.sql ?? "").replace(/\s+/g, " ");
}

describe("claimDueRankChecks", () => {
  beforeEach(() => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(1);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: mocks.executeRaw, $queryRaw: mocks.queryRaw }),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("claims only indexed due state in one locked transaction", async () => {
    const dueCheckAt = new Date("2026-07-28T11:00:00.000Z");
    mocks.queryRaw
      .mockResolvedValueOnce([{ nextCheckAt: dueCheckAt }])
      .mockResolvedValueOnce([
        row("keyword_1"),
        row("keyword_2"),
        row("keyword_3", { device: "mobile" }),
      ])
      .mockResolvedValueOnce([
        { keywordId: "keyword_1", stateVersion: "123" },
        { keywordId: "keyword_2", stateVersion: "124" },
        { keywordId: "keyword_3", stateVersion: "125" },
      ])
      .mockResolvedValueOnce([{ nextCheckAt: dueCheckAt }]);

    await expect(claimDueRankChecks({ now, pageSize: 100 })).resolves.toMatchObject({
      claimed: 3,
      claimedAt: now.toISOString(),
      groups: [
        {
          claims: [
            expect.objectContaining({
              dueCheckAt: dueCheckAt.toISOString(),
              keywordId: "keyword_1",
            }),
            expect.objectContaining({
              dueCheckAt: dueCheckAt.toISOString(),
              keywordId: "keyword_2",
            }),
          ],
          device: "desktop",
          domain: "example.com",
          keywordIds: ["keyword_1", "keyword_2"],
          locationId: "location_1",
          projectId: "project_1",
        },
        {
          claims: [
            expect.objectContaining({
              dueCheckAt: dueCheckAt.toISOString(),
              keywordId: "keyword_3",
            }),
          ],
          device: "mobile",
          domain: "example.com",
          keywordIds: ["keyword_3"],
          locationId: "location_1",
          projectId: "project_1",
        },
      ],
      metrics: {
        distinctProjects: 1,
        largestProjectClaim: 3,
        oldestDueLagMsAfter: 3_600_000,
        oldestDueLagMsBefore: 3_600_000,
        outcome: "claimed",
      },
    });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    const claimSql = sqlText(mocks.queryRaw.mock.calls[1]);
    expect(claimSql).toContain("ROW_NUMBER() OVER");
    expect(claimSql).toContain('"projectRank" <=');
    expect(claimSql).toContain("FOR UPDATE OF state SKIP LOCKED");
    expect(sqlText(mocks.queryRaw.mock.calls[2])).toContain('UPDATE "keyword_dispatch_states"');
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
  });

  it.each(["legacy", "cutover"] as const)(
    "does not open or advance a claim transaction in %s mode",
    async (mode) => {
      vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);

      await expect(claimDueRankChecks({ now })).resolves.toMatchObject({
        claimed: 0,
        groups: [],
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.executeRaw).not.toHaveBeenCalled();
      expect(mocks.queryRaw).not.toHaveBeenCalled();
    },
  );

  it("resolves keyword intent first and excludes inactive owners and read-only projects", async () => {
    await claimDueRankChecks({ now });

    const sql = sqlText(mocks.queryRaw.mock.calls[1]);
    expect(sql).toContain("WHEN ks.id IS NOT NULL THEN ks.frequency");
    expect(sql).toContain('owner."deactivatedAt" IS NULL');
    expect(sql).toContain("p.\"writeMode\" = 'active'");
    expect(sql).toContain("IN ('daily', 'weekly', 'monthly', 'custom_cron')");
  });

  it("bounds oversized pages and advances state without writing schedule intent", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([{ nextCheckAt: new Date("2026-07-28T11:00:00.000Z") }])
      .mockResolvedValueOnce([row("keyword_1")])
      .mockResolvedValueOnce([{ keywordId: "keyword_1", stateVersion: "123" }])
      .mockResolvedValueOnce([]);

    await claimDueRankChecks({ now, pageSize: 50_000 });

    const claim = mocks.queryRaw.mock.calls[1]?.[0] as { values: unknown[] } | undefined;
    expect(claim?.values).toContain(500);
    const update = mocks.queryRaw.mock.calls[2]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(update.sql).toContain('UPDATE "keyword_dispatch_states"');
    expect(update.sql).not.toContain("keyword_schedules");
    expect(update.sql).not.toContain("project_defaults");
    expect(update.values.some((value) => value instanceof Date && value > now)).toBe(true);
  });

  it.each(["0", "-1", "1.5", "101", "unsafe"])(
    "fails closed before opening a transaction for cap %s",
    async (value) => {
      vi.stubEnv("RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS", value);

      await expect(claimDueRankChecks({ now })).rejects.toThrow(
        "RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS",
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});
