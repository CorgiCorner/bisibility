import { prisma } from "@/lib/db/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { produceRecurringOccurrence } from "./produce-one";
import { approval, policy } from "./recurring.test-fixture";

const f = vi.hoisted(() => ({
  approval: vi.fn(),
  cursor: vi.fn(),
  scope: vi.fn(),
  prepare: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  advance: vi.fn(),
  block: vi.fn(),
  tx: {},
  events: [] as string[],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { $queryRaw: f.query, $executeRaw: f.execute };
      f.tx = tx;
      f.events.push("begin");
      const result = await fn(tx);
      f.events.push("commit");
      return result;
    },
  },
}));
vi.mock("./repository", () => ({
  loadRecurringApproval: f.approval,
  blockRecurringCursor: f.block,
}));
vi.mock("./cursor", () => ({ lockedRecurringCursor: f.cursor, advanceRecurringCursor: f.advance }));
vi.mock("./prepare", () => ({ prepareRecurringOccurrence: f.prepare }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitor-worker/policy", () => ({
  monitorWorkerPolicy: (now: Date) => ({
    pollIntervalMs: 30000,
    collectionDeadline: new Date(now.getTime() + 3600000),
  }),
}));
const now = new Date("2026-10-12T12:00:00Z"),
  slot = { occurrenceKey: "2026-10-12", dueAt: now, plannedFor: now, intervalMs: 86400000 };
beforeEach(() => {
  vi.resetAllMocks();
  f.events.length = 0;
  f.approval.mockResolvedValue(approval);
  f.cursor.mockResolvedValue({
    cursor: { state: "active", nextDueAt: now, usedCents: "0", issuedOccurrences: 0 },
    slot,
  });
  f.scope.mockResolvedValue({ actor: { id: "actor" }, project: { id: "db-project" } });
  f.query.mockResolvedValue([{ busy: false }]);
  const {
    actorId,
    internalProjectId,
    connectionStamp,
    definitionHash,
    calendar,
    maximumPerOccurrenceCents,
    maximumTotalCents,
    maximumOccurrences,
    validUntil,
    catchUp,
    scheduleId,
    expectedScheduleEpoch,
    ...command
  } = policy;
  f.prepare.mockResolvedValue({
    ...command,
    expectedVersion: 2,
    scheduleIntentId: "scheduled-intent",
  });
  f.execute.mockImplementation(async () => {
    f.events.push("enqueue");
    return 1;
  });
  f.advance.mockImplementation(async () => {
    f.events.push("advance");
  });
});
describe("atomic same-worker due producer", () => {
  it("writes the original scheduled command and advances exact issuance in one transaction", async () => {
    expect(await produceRecurringOccurrence("approval", prisma, now)).toBe("queued");
    expect(f.prepare).toHaveBeenCalledWith(f.tx, expect.anything(), approval, "2026-10-12", now);
    expect(f.advance).toHaveBeenCalledWith(f.tx, approval, now, "queued", now, "0.06");
    expect(f.events).toEqual(["begin", "enqueue", "advance", "commit"]);
    const values = f.execute.mock.calls[0];
    expect(values[0].join(" ")).toContain("'scheduled'");
    expect(values).toContain("approval");
    expect(values).toContain("2026-10-12");
    expect(values.filter((v) => typeof v === "string").join(" ")).not.toContain("consentToken");
  });
  it("does not quote/reserve when manual or unknown work retains the same target", async () => {
    f.query.mockResolvedValue([{ busy: true }]);
    expect(await produceRecurringOccurrence("approval", prisma, now)).toBe("target_retained");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.advance).not.toHaveBeenCalled();
  });
  it("refuses a malformed prepared target before job insertion or cursor issuance", async () => {
    const original = await f.prepare();
    f.prepare.mockResolvedValue({ ...original, targetIds: ["foreign"] });
    await expect(produceRecurringOccurrence("approval", prisma, now)).rejects.toThrow(
      "strict lmt_",
    );
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.advance).not.toHaveBeenCalled();
    expect(f.block).not.toHaveBeenCalled();
    expect(f.events).not.toContain("commit");
  });
  it("skips complete missed calendar intervals without quoting backlog", async () => {
    expect(
      await produceRecurringOccurrence("approval", prisma, new Date("2026-10-14T12:00:00Z")),
    ).toBe("skipped");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.advance.mock.calls[0][3]).toBe("skipped");
  });
  it("does not advance authority on an unrecognized infrastructure error", async () => {
    f.prepare.mockRejectedValue(new Error("database offline"));
    await expect(produceRecurringOccurrence("approval", prisma, now)).rejects.toThrow(
      "database offline",
    );
    expect(f.block).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.events).not.toContain("commit");
  });
  it("blocks exhausted explicit authority before job insert", async () => {
    f.cursor.mockResolvedValue({
      cursor: { state: "active", nextDueAt: now, usedCents: "0.12", issuedOccurrences: 2 },
      slot,
    });
    expect(await produceRecurringOccurrence("approval", prisma, now)).toBe("blocked");
    expect(f.block.mock.calls[0][2]).toBe("ceiling_exhausted");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not claim the same cursor twice after atomic advancement", async () => {
    f.cursor.mockResolvedValue({
      cursor: {
        state: "active",
        nextDueAt: new Date("2026-10-13T12:00:00Z"),
        usedCents: "0.06",
        issuedOccurrences: 1,
      },
      slot: { ...slot, occurrenceKey: "2026-10-13" },
    });
    expect(await produceRecurringOccurrence("approval", prisma, now)).toBe("not_due");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
