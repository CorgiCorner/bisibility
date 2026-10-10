import { beforeEach, describe, expect, it, vi } from "vitest";
import { skipEmptyScheduleOccurrences } from "./empty-schedule";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  markets: vi.fn(),
  update: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: mocks.lock,
        projectMarket: { findMany: mocks.markets },
        keyword: { count: mocks.count },
        rankCheckRun: { updateMany: mocks.update },
      }),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.markets.mockResolvedValue([{ locationId: "active" }]);
  mocks.count.mockResolvedValue(0);
});

describe("empty schedule occurrences", () => {
  it("retires only unlaunched empty occurrences while preserving completed history and schedule intent", async () => {
    const now = new Date("2026-10-07T08:00:00Z");
    await skipEmptyScheduleOccurrences({ id: "schedule", projectId: "project" }, now);
    expect(mocks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "completed",
        outcome: "deferred",
        blockedReason: "no_active_keywords",
        finishedAt: now,
        targetCount: 0,
      }),
      where: {
        checkScheduleId: "schedule",
        projectId: "project",
        launchedAt: null,
        startedAt: null,
        status: { in: ["planned", "blocked"] },
        items: { none: {} },
      },
    });
    expect(mocks.count.mock.calls[0][0].where).toMatchObject({
      projectId: "project",
      checkScheduleId: "schedule",
      archivedAt: null,
      locationId: { in: ["active"] },
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.count.mock.invocationCallOrder[0],
    );
  });
  it("does not skip a pending occurrence when a member is added before the locked check", async () => {
    mocks.count.mockResolvedValue(1);
    await skipEmptyScheduleOccurrences({ id: "schedule", projectId: "project" }, new Date());
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
