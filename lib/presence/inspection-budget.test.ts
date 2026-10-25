import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInspectionBudget, releaseInspections, reserveInspections } from "./inspection-budget";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(),
  transaction: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    project: { findUniqueOrThrow: vi.fn() },
    auditLog: { findMany: vi.fn() },
    urlPresence: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { ...mocks.tx, $transaction: mocks.transaction },
}));
const now = new Date("2026-10-24T12:00:00Z");
const projectId = "project-internal";
const targetId = "prj_a00000000000000000000000";
const urls = ["https://example.com/a", "https://example.com/b"];
const day = { gte: new Date("2026-10-24T07:00:00Z"), lt: new Date("2026-10-25T07:00:00Z") };

describe("shared reservation-based project daily inspection allowance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.tx.project.findUniqueOrThrow.mockResolvedValue({
      publicId: targetId,
      defaults: { inspectionDailyLimit: 3 },
    });
    mocks.tx.urlPresence.findMany.mockResolvedValue([]);
    mocks.tx.auditLog.findMany.mockResolvedValue([]);
    mocks.writeAudit.mockResolvedValue({ id: "audit-db" });
  });
  it("counts reservations minus releases without consulting stored results", async () => {
    mocks.tx.auditLog.findMany.mockResolvedValue([
      { after: { admitted: 3, repeats: 2 } },
      { after: { released: 1 } },
    ]);
    expect(await getInspectionBudget(projectId, now)).toMatchObject({ used: 2, remaining: 1 });
    expect(mocks.tx.auditLog.findMany).toHaveBeenCalledWith({
      where: { projectId, action: "search_index.inspect", createdAt: day },
      select: { after: true },
    });
    expect(mocks.tx.urlPresence.findMany).not.toHaveBeenCalled();
  });
  it("makes the next interleaved admission see the first reservation before any results exist", async () => {
    const rows: Array<{ after: unknown }> = [];
    mocks.tx.auditLog.findMany.mockImplementation(async () => [...rows]);
    mocks.writeAudit.mockImplementation(async (input) => {
      rows.push({ after: input.after });
      return { id: "audit-db" };
    });
    let locked = Promise.resolve();
    mocks.transaction.mockImplementation((fn) => {
      const result = locked.then(() => fn(mocks.tx));
      locked = result.then(() => undefined);
      return result;
    });
    const [first, second] = await Promise.all([
      reserveInspections({ projectId, urls, now }),
      reserveInspections({ projectId, urls, now }),
    ]);
    expect(first.admitted).toEqual(urls);
    expect(second.admitted).toEqual([urls[0]]);
    expect(second.counts).toEqual({ requested: 2, admitted: 1, refused: 1, repeats: 0 });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledBefore(mocks.tx.auditLog.findMany);
    expect(mocks.tx.$executeRaw.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: second.counts }),
      mocks.tx,
    );
    await releaseInspections({ projectId, targetId, released: 1 });
    expect(await getInspectionBudget(projectId, now)).toMatchObject({ used: 2, remaining: 1 });
  });
  it("writes a zero-admitted manual request but no exhausted sync reservation", async () => {
    mocks.tx.auditLog.findMany.mockResolvedValue([{ after: { admitted: 3 } }]);
    expect((await reserveInspections({ projectId, urls, now })).admitted).toEqual([]);
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    mocks.writeAudit.mockClear();
    await reserveInspections({ projectId, actorId: null, urls, now, skipEmpty: true });
    await reserveInspections({ projectId, urls: [], now, skipEmpty: true });
    await releaseInspections({ projectId, targetId, released: 0 });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it.each([null, {}, { repeats: 2 }, { released: 0 }])(
    "treats missing numeric fields as zero: %j",
    async (after) => {
      mocks.tx.auditLog.findMany.mockResolvedValue([{ after }]);
      expect(await getInspectionBudget(projectId, now)).toMatchObject({ used: 0, remaining: 3 });
    },
  );
  it.each([null, "1", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid present count: %j",
    async (admitted) => {
      mocks.tx.auditLog.findMany.mockResolvedValue([{ after: { admitted } }]);
      await expect(getInspectionBudget(projectId, now)).rejects.toThrow("count is invalid");
    },
  );
  it.each(["released", "requested", "refused", "repeats"])(
    "rejects malformed %s evidence",
    async (field) => {
      mocks.tx.auditLog.findMany.mockResolvedValue([{ after: { [field]: -1 } }]);
      await expect(getInspectionBudget(projectId, now)).rejects.toThrow("count is invalid");
    },
  );
  it("writes no sync row when inspection is disabled", async () => {
    mocks.tx.project.findUniqueOrThrow.mockResolvedValue({
      publicId: targetId,
      defaults: { inspectionDailyLimit: 0 },
    });
    expect((await reserveInspections({ projectId, urls, now, skipEmpty: true })).admitted).toEqual(
      [],
    );
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("uses the DB Pacific day at midnight and excludes prior-day reservations", async () => {
    mocks.tx.$queryRaw.mockResolvedValue([{ now: day.lt }]);
    await reserveInspections({ projectId, urls });
    expect(mocks.tx.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        projectId,
        action: "search_index.inspect",
        createdAt: { gte: day.lt, lt: new Date("2026-10-26T07:00:00Z") },
      },
      select: { after: true },
    });
  });
  it("counts repeats only for admitted URLs in the same Pacific day", async () => {
    mocks.tx.urlPresence.findMany.mockResolvedValue([
      { url: urls[0], checkedAt: day.gte },
      { url: urls[1], checkedAt: day.lt },
    ]);
    expect(await reserveInspections({ projectId, urls, now })).toMatchObject({
      counts: { repeats: 1 },
    });
  });

  it("does not subtract an earlier day's released reservation from today's allowance", async () => {
    mocks.tx.auditLog.findMany.mockResolvedValue([
      { after: { admitted: 1 } },
      { after: { released: 2, reservationAt: "2026-10-24T06:59:59Z" } },
    ]);
    expect(await getInspectionBudget(projectId, now)).toMatchObject({ used: 1, remaining: 2 });
  });

  it("uses the fixed allowance by default but allows the self-host available quota mode", async () => {
    mocks.tx.auditLog.findMany.mockResolvedValue([{ after: { admitted: 2000 } }]);
    mocks.tx.project.findUniqueOrThrow.mockResolvedValue({
      publicId: targetId,
      defaults: { inspectionDailyLimit: 50, inspectionBudgetMode: "available_quota" },
    });
    expect((await getInspectionBudget(projectId, now)).remaining).toBeGreaterThan(2000);
  });
});
