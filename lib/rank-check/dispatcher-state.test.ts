import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillKeywordDispatchStates,
  refreshKeywordDispatchStates,
  seedKeywordDispatchStates,
} from "./dispatcher-state";

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

function row(keywordId: string, frequency = "daily") {
  return {
    anchorCheckAt: null,
    cronExpression: null,
    frequency,
    jitterMinutes: 0,
    keywordId,
    timezone: "UTC",
  };
}

function sqlText(call: unknown[]) {
  return String((call[0] as { sql?: string } | undefined)?.sql ?? "").replace(/\s+/g, " ");
}

describe("dispatcher state maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    mocks.executeRaw.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: mocks.executeRaw, $queryRaw: mocks.queryRaw }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("backfills bounded stable pages and resumes after the returned cursor", async () => {
    mocks.queryRaw.mockResolvedValueOnce([row("keyword_010"), row("keyword_020")]);

    await expect(
      backfillKeywordDispatchStates({ cursor: "keyword_005", now, pageSize: 2 }),
    ).resolves.toEqual({
      cursor: "keyword_020",
      done: false,
      seeded: 2,
    });

    const sql = sqlText(mocks.queryRaw.mock.calls[0]);
    expect(sql).toContain("k.id >");
    expect(sql).toContain("ORDER BY k.id");
    expect(sql).toContain("FOR UPDATE OF k SKIP LOCKED");
    expect((mocks.queryRaw.mock.calls[0][0] as { values: unknown[] }).values).toEqual(
      expect.arrayContaining(["keyword_005", 2]),
    );
  });

  it("heals a project that becomes active after an earlier sweep", async () => {
    mocks.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([row("keyword_reactivated")]);

    await expect(backfillKeywordDispatchStates({ cursor: null, now })).resolves.toEqual({
      cursor: null,
      done: true,
      seeded: 0,
    });
    await expect(backfillKeywordDispatchStates({ cursor: null, now })).resolves.toEqual({
      cursor: "keyword_reactivated",
      done: true,
      seeded: 1,
    });

    for (const call of mocks.queryRaw.mock.calls) {
      const sql = sqlText(call);
      expect(sql).toContain('owner."deactivatedAt" IS NULL');
      expect(sql).toContain('p."writeMode" =');
    }
  });

  it("seeds a newly created keyword after bootstrap completion", async () => {
    mocks.queryRaw.mockResolvedValueOnce([row("keyword_new")]);

    await expect(seedKeywordDispatchStates(["keyword_new"], { now })).resolves.toBe(1);

    expect(sqlText(mocks.queryRaw.mock.calls[0])).toContain("k.id IN");
    expect(sqlText(mocks.executeRaw.mock.calls[0])).toContain(
      'INSERT INTO "keyword_dispatch_states"',
    );
  });

  it("allows bounded state repair in cutover mode", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    mocks.queryRaw.mockResolvedValueOnce([row("keyword_cutover")]);

    await expect(seedKeywordDispatchStates(["keyword_cutover"], { now })).resolves.toBe(1);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
  });

  it("seeds a 500-keyword batch with one bounded bulk write", async () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      row(`keyword_${String(index).padStart(3, "0")}`),
    );
    mocks.queryRaw.mockResolvedValueOnce(rows);

    await expect(
      seedKeywordDispatchStates(
        rows.map(({ keywordId }) => keywordId),
        { now },
      ),
    ).resolves.toBe(500);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    const write = mocks.executeRaw.mock.calls[0];
    expect(sqlText(write)).toContain('INSERT INTO "keyword_dispatch_states"');
    const values = (write?.[0] as { values?: unknown[] } | undefined)?.values ?? [];
    expect(values.filter((value) => typeof value === "string")).toHaveLength(500);
    expect(values.filter((value) => value instanceof Date)).toHaveLength(500);
  });

  it("recomputes weekly-to-daily intent and inherited defaults immediately", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([row("keyword_override", "daily")])
      .mockResolvedValueOnce([row("keyword_inherited", "daily")]);

    await refreshKeywordDispatchStates({ keywordIds: ["keyword_override"], now });
    await refreshKeywordDispatchStates({ inheritedProjectId: "project_1", now });

    expect(mocks.executeRaw.mock.calls.some((call) => sqlText(call).includes("DELETE FROM"))).toBe(
      true,
    );
    const insertedDates = mocks.executeRaw.mock.calls.flatMap(
      (call) => (call[0] as { values?: unknown[] }).values ?? [],
    );
    expect(
      insertedDates.some(
        (value) =>
          value instanceof Date &&
          value > now &&
          value <= new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      ),
    ).toBe(true);
  });

  it("is a complete no-op while disabled", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");

    await expect(seedKeywordDispatchStates(["keyword_1"], { now })).resolves.toBe(0);
    await expect(refreshKeywordDispatchStates({ keywordIds: ["keyword_1"], now })).resolves.toBe(0);
    await expect(backfillKeywordDispatchStates({ cursor: null, now })).resolves.toEqual({
      cursor: null,
      done: true,
      seeded: 0,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
