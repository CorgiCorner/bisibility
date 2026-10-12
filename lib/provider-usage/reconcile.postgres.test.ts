import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { historyMigrationId } from "@/lib/metering/history-migration";
import { source } from "@/lib/metering/history-test-data";
import { receiptFromEntry } from "@/lib/metering/mapping";
import { paidFixture } from "@/lib/metering/paid-attempt-test-fixture";
import { projectSpendingBudget } from "@/lib/metering/spending-limits";
import { importHistoricalEvidence } from "@/lib/metering/store/history";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, vi } from "vitest";
import { loadByokEvidence, persistByokEvidence } from "./byok-evidence-storage";
import { reconcileProviderUsage } from "./reconcile";
import { recoverCandidate } from "./reconcile-recovery";
import { recoveryCandidates } from "./reconcile-state";

vi.mock(
  "@/lib/metering/transport-proof-extension",
  async () => import("@/lib/metering/retained-native-proof"),
);
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
async function setup() {
  const f = await paidFixture();
  const connect = () =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: f.url }, { schema: f.schema }) });
  let db = connect();
  const run = <T>(work: Parameters<typeof f.run<T>>[0]) =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        return work(tx);
      },
      { timeout: 30000 },
    );
  const watermark = vi.fn();
  await run(async (tx) => {
    await tx.$executeRaw`CREATE TABLE queued_rank_check_batches(id text PRIMARY KEY, "connectionId" text, "projectId" text, provider text)`;
    await tx.$executeRaw`ALTER TABLE queued_rank_check_tasks ADD COLUMN "batchId" text, ADD COLUMN "costCents" numeric, ADD COLUMN "providerTaskId" text, ADD COLUMN "providerTag" text`;
    await tx.$executeRaw`INSERT INTO queued_rank_check_batches VALUES('batch','connection','project','dataforseo')`;
  });
  const client = {
    $queryRaw: (query: never) => run((tx) => tx.$queryRaw(query)),
    $transaction: <T>(work: (tx: unknown) => Promise<T>) =>
      run((tx) => work(Object.assign(tx, { instanceSetting: { upsert: watermark } }))),
    get providerCostEntry() {
      throw new Error("legacy ledger accessed");
    },
  };
  const reconcile = (limit = 100) =>
    reconcileProviderUsage(client as never, { limit, namespace: "test" } as never);
  const add = async (id: string, cost: string | null, native: string | null = null) => {
    const legacy = source({
      id,
      feature: "rank_check",
      correlationId: id,
      providerRequestId: native,
      measurementStatus: "unknown",
      createdAt: "2026-09-30T23:59:59.000Z",
    });
    const operation = historicalOperation(legacy, "test", "2026-10-01T00:00:00Z", {
      principal: "original-owner",
    });
    await run(async (tx) => {
      await importHistoricalEvidence(tx, {
        migrationId: historyMigrationId,
        sourceId: id,
        sourceHash: id,
        operation,
        cutoverAt: "2026-10-01T00:00:00Z",
      });
      await tx.$executeRaw`INSERT INTO queued_rank_check_tasks(id,"batchId","costCents","providerTaskId","providerTag") VALUES(${id},'batch',${cost}::numeric,${`native:${id}`},'tag;cs=own;')`;
    });
  };
  return {
    ...f,
    run,
    add,
    reconcile,
    watermark,
    async restart() {
      await db.$disconnect();
      await f.restart();
      db = connect();
    },
    async close() {
      await db.$disconnect();
      await f.close();
    },
  };
}
test("recovers original historical queued cost into Store, preserving prior-month counters and immutable owner", async () => {
  const f = await setup();
  try {
    await f.store.putBudget(projectSpendingBudget("test", "project", "100", 1));
    await f.add("a", "1.2345");
    expect(await f.reconcile()).toMatchObject({ reconciled: 1, unconfirmed: 0, hasMore: false });
    const operation = await f.store.getOperation({
      namespace: "test",
      principal: "original-owner",
      operationId: "legacy:a",
    });
    expect(operation).toMatchObject({
      state: "settled",
      lease: null,
      scope: { principal: "original-owner" },
    });
    expect(operation?.receipts.at(-1)?.occurredAt).toBe("2026-09-30T23:59:59.000Z");
    expect(
      await f.run(
        (tx) =>
          tx.$queryRaw`SELECT epoch,settled_value::text AS used FROM metering_budget_usage WHERE budget_id='project:project:monthly'`,
      ),
    ).toEqual([{ epoch: "2026-09", used: "12345" }]);
    expect(await f.reconcile()).toMatchObject({ reconciled: 0 });
  } finally {
    await f.close();
  }
});
test("durable bounded progress crosses process loss and leaves unknown-cost gates closed until all proof is known", async () => {
  const f = await setup();
  try {
    await f.add("a", null);
    await f.add("b", "1");
    expect(await f.reconcile(1)).toMatchObject({ reconciled: 0, scanned: 1, hasMore: true });
    await f.restart();
    expect(await f.reconcile(1)).toMatchObject({
      reconciled: 1,
      scanned: 1,
      hasMore: false,
      unconfirmed: 1,
    });
    const gates = () =>
      f.run(
        (tx) =>
          tx.$queryRaw<
            { body: { limit: unknown } }[]
          >`SELECT b.body FROM metering_budget b WHERE budget_id LIKE 'unresolved:%' AND NOT EXISTS(SELECT 1 FROM metering_budget n WHERE n.budget_id=b.budget_id AND n.version>b.version)`,
      );
    expect((await gates()).every((row) => row.body.limit !== null)).toBe(true);
    await f.run(
      (tx) => tx.$executeRaw`UPDATE queued_rank_check_tasks SET "costCents"=2 WHERE id='a'`,
    );
    while ((await f.reconcile(1)).hasMore) {}
    expect((await gates()).every((row) => row.body.limit === null)).toBe(true);
    expect(await f.reconcile()).toMatchObject({ unconfirmed: 0, reconciled: 0 });
    await f.add("c", null);
    expect((await gates()).every((row) => row.body.limit !== null)).toBe(true);
  } finally {
    await f.close();
  }
});
test("a conflicting proof is reported durably without starving later recovery", async () => {
  const f = await setup();
  try {
    await f.add("a", "1", "conflicting-native");
    await f.add("b", "2");
    expect(await f.reconcile()).toMatchObject({ reconciled: 1, failed: 1, unconfirmed: 1 });
    await f.restart();
    expect(await f.reconcile()).toMatchObject({ reconciled: 0, failed: 1, unconfirmed: 1 });
    await f.run(
      (tx) =>
        tx.$executeRaw`UPDATE queued_rank_check_tasks SET "providerTaskId"='conflicting-native' WHERE id='a'`,
    );
    expect(await f.reconcile()).toMatchObject({ reconciled: 1, failed: 0, unconfirmed: 0 });
  } finally {
    await f.close();
  }
});

test("a recovery incident clears after another path resolves its candidate", async () => {
  const f = await setup();
  try {
    await f.add("resolved-elsewhere", "1", "conflicting-native");
    expect(await f.reconcile()).toMatchObject({ failed: 1, unconfirmed: 1 });
    await f.run(async (tx) => {
      await tx.$executeRaw`UPDATE queued_rank_check_tasks SET "providerTaskId"='conflicting-native' WHERE id='resolved-elsewhere'`;
      await recoverCandidate(
        tx,
        "test",
        {
          cursor: "o:legacy:resolved-elsewhere",
          kind: "operation",
          id: "legacy:resolved-elsewhere",
          connection: "connection",
        },
        new Date(),
      );
    });
    expect(await f.reconcile()).toMatchObject({
      failed: 0,
      unconfirmed: 0,
      scanned: 0,
      lastReconciledAt: expect.any(String),
    });
  } finally {
    await f.close();
  }
});

test("retained pre-cutover evidence reconciles its imported operation without counting it twice", async () => {
  const f = await setup();
  try {
    await f.store.putBudget(projectSpendingBudget("test", "project", "100", 1));
    await f.add("overlap", "2");
    await f.run(async (tx) => {
      await tx.$executeRaw`
      INSERT INTO metering_usage_evidence(id,namespace,principal,"projectId","connectionId",provider,feature,source,"correlationId","createdAt",unit,estimate,receipt,"receiptId","measurementStatus")
      VALUES('overlap','test','original-owner','project','connection','dataforseo','rank_check','app','overlap','2026-09-30T23:59:59Z','cents','{"cents":"2","units":"1"}'::jsonb,'{"costCents":"2","quantity":"1","cached":false,"failed":false}'::jsonb,'overlap-proof','recorded')`;
      const entry = await loadByokEvidence(tx, "overlap");
      if (!entry) throw new Error("Missing overlap proof");
      await tx.meteringUsageEvidence.update({
        where: { id: "overlap" },
        data: { receiptId: receiptFromEntry(entry, new Date()).id },
      });
    });
    await f.reconcile();
    expect(
      await f.run(
        (tx) => tx.$queryRaw`SELECT operation_id FROM metering_operation ORDER BY operation_id`,
      ),
    ).toEqual([{ operation_id: "legacy:overlap" }]);
    expect(
      await f.run(
        (tx) =>
          tx.$queryRaw`SELECT settled_value::text AS used FROM metering_budget_usage WHERE budget_id='project:project:monthly'`,
      ),
    ).toEqual([{ used: "20000" }]);
    expect(await f.reconcile()).toMatchObject({ reconciled: 0, unconfirmed: 0, scanned: 0 });
  } finally {
    await f.close();
  }
});

test("repairs missing inactive Store history through trusted import without admission", async () => {
  const f = await setup();
  try {
    await f.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO metering_usage_evidence(id,namespace,principal,"projectId","connectionId",provider,feature,source,"correlationId","createdAt",unit,estimate,receipt,"receiptId","measurementStatus")
        VALUES('retained','test','original-owner','project','connection','dataforseo','rank_check','app','a','2026-09-30T23:59:59Z','cents','{"cents":"1","units":"1"}'::jsonb,'{"costCents":"1","quantity":"1","cached":false,"failed":false}'::jsonb,'proof','recorded')`;
    });
    expect(await f.run((tx) => loadByokEvidence(tx, "retained"))).toMatchObject({
      namespace: "test",
      ownerId: "original-owner",
    });
    expect(await f.run((tx) => recoveryCandidates(tx, "test", new Date(), " ", 100))).toHaveLength(
      1,
    );
    expect(await f.reconcile()).toMatchObject({ reconciled: 1, unconfirmed: 0 });
    expect(
      await f.store.getOperation({
        namespace: "test",
        principal: "original-owner",
        operationId: "retained",
      }),
    ).toMatchObject({ state: "settled", lease: null });
    await f.run((tx) =>
      persistByokEvidence(
        tx,
        "retained",
        { costCents: 2, quantity: 1, cached: false, failed: false },
        null,
      ),
    );
    expect(await f.reconcile()).toMatchObject({ reconciled: 1 });
    expect(
      (
        await f.store.getOperation({
          namespace: "test",
          principal: "original-owner",
          operationId: "retained",
        })
      )?.receipts.at(-1)?.cost.money?.units,
    ).toBe(20000n);
  } finally {
    await f.close();
  }
});
