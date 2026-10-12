import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { paidFixture } from "@/lib/metering/paid-attempt-test-fixture";
import { importHistoricalEvidence } from "@/lib/metering/store/history";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, vi } from "vitest";
import { purgeExpiredQueuedRankCheckBatches } from "./queued-retention";

const shared = vi.hoisted(() => ({ db: {} as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
test("retention pages past an unresolved terminal batch and preserves its original task proof", async () => {
  const f = await paidFixture();
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: f.url }, { schema: f.schema }),
  });
  try {
    await f.run(async (tx) => {
      await tx.$executeRaw`CREATE TABLE queued_rank_check_batches(id text PRIMARY KEY,"projectId" text,state text,"expiresAt" timestamptz)`;
      await tx.$executeRaw`ALTER TABLE queued_rank_check_tasks ADD COLUMN "batchId" text,ADD COLUMN "providerTaskId" text`;
      for (const id of ["unknown", "known"]) {
        await tx.$executeRaw`INSERT INTO queued_rank_check_batches VALUES(${id},'project','completed','2026-09-01')`;
        await tx.$executeRaw`INSERT INTO queued_rank_check_tasks(id,"batchId","providerTaskId") VALUES(${id},${id},${`native:${id}`})`;
        const op = historicalOperation(
          source({
            id,
            correlationId: id,
            providerRequestId: `native:${id}`,
            measurementStatus: id === "unknown" ? "unknown" : "recorded",
          }),
          "test",
          "2026-10-01T00:00:00Z",
          { principal: "owner" },
        );
        await importHistoricalEvidence(tx, {
          migrationId: "history",
          sourceId: id,
          sourceHash: id,
          operation: op,
          cutoverAt: "2026-10-01T00:00:00Z",
        });
      }
    });
    shared.db = new Proxy(db, {
      get(target, key) {
        return key === "$queryRaw"
          ? (query: Prisma.Sql) => f.run((tx) => tx.$queryRaw(query))
          : Reflect.get(target, key);
      },
    });
    expect(await purgeExpiredQueuedRankCheckBatches(new Date("2026-10-10"))).toMatchObject({
      deleted: 1,
      hasMore: false,
    });
    expect(await db.queuedRankCheckBatch.findMany({ select: { id: true } })).toEqual([
      { id: "unknown" },
    ]);
    expect(
      await f.run((tx) => tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE id='unknown'`),
    ).toEqual([{ id: "unknown" }]);
  } finally {
    await db.$disconnect();
    await f.close();
  }
});
