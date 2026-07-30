import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE,
  reconcileExpiredQueuedRankCheckBatches,
} from "./queued-deadline-maintenance";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";

const mocks = vi.hoisted(() => ({
  deferBatch: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    queuedRankCheckBatch: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./queued-lifecycle", () => ({
  deferQueuedRankCheckBatch: mocks.deferBatch,
}));

describe("queued deadline maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      { id: "batch_pending", queueDeadlineAt: new Date("2026-07-29T07:00:00.000Z") },
      { id: "batch_terminal", queueDeadlineAt: new Date("2026-07-29T07:01:00.000Z") },
    ]);
    mocks.deferBatch
      .mockResolvedValueOnce({ pending: 1, state: "ready" })
      .mockResolvedValueOnce({ pending: 0, state: "failed" });
  });

  it("reconciles an indexed bounded page through lease-aware cleanup", async () => {
    const now = new Date("2026-07-29T07:30:00.000Z");

    await expect(reconcileExpiredQueuedRankCheckBatches(now)).resolves.toEqual({
      examined: 2,
      failed: 0,
      failureBatchIds: [],
      hasMore: false,
      nextCursor: null,
      pending: 1,
      terminal: 1,
    });
    const query = mocks.prisma.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    expect(query.strings.join("?")).toContain(
      `AND "state" IN ('ambiguous', 'prepared', 'ready', 'submitted', 'submitting')`,
    );
    expect(query.values).toEqual([now, QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE]);
    expect(mocks.deferBatch).toHaveBeenNthCalledWith(1, "batch_pending", QUEUED_DEADLINE_REASON);
    expect(mocks.deferBatch).toHaveBeenNthCalledWith(2, "batch_terminal", QUEUED_DEADLINE_REASON);
  });

  it("continues past a permanent failure across bounded keyset pages", async () => {
    const now = new Date("2026-07-29T07:30:00.000Z");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deferBatch.mockReset();
    const batches = Array.from(
      { length: QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE * 2 + 2 },
      (_, index) => ({
        id: `batch_${String(index).padStart(3, "0")}`,
        queueDeadlineAt: new Date(now.getTime() - 60_000 + index),
        terminal: false,
      }),
    );
    let permanentFailure = true;
    mocks.prisma.$queryRaw.mockImplementation(async (query: { values: unknown[] }) => {
      const cursorId = query.values.length === 4 ? String(query.values[2]) : null;
      return batches
        .filter((batch) => !batch.terminal && (cursorId === null || batch.id > cursorId))
        .slice(0, QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE);
    });
    mocks.deferBatch.mockImplementation(async (batchId: string) => {
      if (batchId === "batch_000" && permanentFailure) throw new Error("permanent cleanup error");
      const batch = batches.find((candidate) => candidate.id === batchId);
      if (batch) batch.terminal = true;
      return { pending: 0, state: "deferred" };
    });

    const first = await reconcileExpiredQueuedRankCheckBatches(now);
    const second = await reconcileExpiredQueuedRankCheckBatches(now, first.nextCursor ?? undefined);
    const third = await reconcileExpiredQueuedRankCheckBatches(now, second.nextCursor ?? undefined);

    const secondQuery = mocks.prisma.$queryRaw.mock.calls[1]?.[0] as { values: unknown[] };
    expect(secondQuery.values).toContain(first.nextCursor?.queueDeadlineAt);
    expect(secondQuery.values).toContain(first.nextCursor?.id);

    expect(first).toMatchObject({
      examined: QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE,
      failed: 1,
      failureBatchIds: ["batch_000"],
      hasMore: true,
    });
    expect(second).toMatchObject({
      examined: QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE,
      failed: 0,
      hasMore: true,
    });
    expect(third).toMatchObject({ examined: 2, failed: 0, hasMore: false });
    expect(mocks.deferBatch).toHaveBeenCalledTimes(batches.length);
    expect(batches.slice(1).every((batch) => batch.terminal)).toBe(true);
    expect(batches[0]?.terminal).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[rank-check] queued deadline maintenance failed", {
      batchId: "batch_000",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(
      /keyword|domain|url|credential|provider/i,
    );

    permanentFailure = false;
    const retry = await reconcileExpiredQueuedRankCheckBatches(now);
    expect(retry).toMatchObject({
      examined: 1,
      failed: 0,
      hasMore: false,
      terminal: 1,
    });
    expect(batches.every((batch) => batch.terminal)).toBe(true);
  });
});
