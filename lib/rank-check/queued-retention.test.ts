import { beforeEach, describe, expect, it, vi } from "vitest";
import { purgeExpiredQueuedRankCheckBatches } from "./queued-retention";

const mocks = vi.hoisted(() => ({
  batches: Array.from({ length: 205 }, (_, index) => ({
    id: `batch_${String(index).padStart(3, "0")}`,
  })),
  prisma: {
    $queryRaw: vi.fn(),
    queuedRankCheckBatch: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("queued batch retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockImplementation(async () => mocks.batches.slice(0, 101));
    mocks.batches.splice(
      0,
      mocks.batches.length,
      ...Array.from({ length: 205 }, (_, index) => ({
        id: `batch_${String(index).padStart(3, "0")}`,
      })),
    );
    mocks.prisma.queuedRankCheckBatch.findMany.mockImplementation(({ take }) =>
      Promise.resolve(mocks.batches.slice(0, take)),
    );
    mocks.prisma.queuedRankCheckBatch.deleteMany.mockImplementation(({ where }) => {
      const ids = new Set(where.id.in);
      const before = mocks.batches.length;
      mocks.batches.splice(
        0,
        mocks.batches.length,
        ...mocks.batches.filter((batch) => !ids.has(batch.id)),
      );
      return Promise.resolve({ count: before - mocks.batches.length });
    });
  });

  it("deletes one bounded page and reports resumable backlog", async () => {
    await expect(
      purgeExpiredQueuedRankCheckBatches(new Date("2026-07-29T05:00:00.000Z")),
    ).resolves.toEqual({
      deleted: 100,
      hasMore: true,
      pageSize: 100,
    });
    expect(mocks.batches).toHaveLength(105);
  });

  it("drains multiple pages and is idempotent after the backlog is empty", async () => {
    const now = new Date("2026-07-29T05:00:00.000Z");

    await purgeExpiredQueuedRankCheckBatches(now);
    await purgeExpiredQueuedRankCheckBatches(now);
    await expect(purgeExpiredQueuedRankCheckBatches(now)).resolves.toEqual({
      deleted: 5,
      hasMore: false,
      pageSize: 100,
    });
    await expect(purgeExpiredQueuedRankCheckBatches(now)).resolves.toEqual({
      deleted: 0,
      hasMore: false,
      pageSize: 100,
    });
  });
});

it("retains terminal batches whose original accounting operation is unresolved or missing", async () => {
  vi.clearAllMocks();

  mocks.prisma.$queryRaw.mockResolvedValue([]);
  expect(await purgeExpiredQueuedRankCheckBatches()).toMatchObject({ deleted: 0 });
  expect(mocks.prisma.queuedRankCheckBatch.deleteMany).not.toHaveBeenCalled();
});
