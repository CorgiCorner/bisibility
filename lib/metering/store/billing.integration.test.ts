import type { BillingImportInput, Operation } from "@usagekit/core";
import type { Store } from "@usagekit/store";
import { expect, test } from "vitest";
import { createPostgresStore } from "./index";
import { Prisma, transactions } from "./sql";
import { command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";
import { createTransactionBoundStore } from "./transactional";

const window = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };
const bill = (overrides: Partial<BillingImportInput> = {}): BillingImportInput => ({
  scope: { namespace: "test", principal: "u1", connection: "c1" },
  provider: "search",
  fileHash: "a".repeat(64),
  window,
  expectedPreviousImportId: null,
  attribution: { fundingSource: "byok", costOwner: "u1" },
  lines: [
    {
      providerRequestId: "native-a",
      occurredAt: receipt().occurredAt,
      cost: { units: 100n, currency: "USD" },
    },
  ],
  ...overrides,
});
async function observed(store: Store): Promise<Operation> {
  const reserved = await store.reserve({ ...request(), operationId: "observed" });
  if (reserved.outcome !== "reserved") throw new Error("Fixture reservation failed");
  const grant = await store.markDispatchIntent({
    ...command(reserved.operation),
    holder: "h",
    leaseTtlMs: 60000,
  });
  if (!("granted" in grant) || !grant.granted) throw new Error("Fixture grant failed");
  const settled = await store.settle({
    ...command(grant.operation),
    authority: { kind: "lease", leaseId: grant.lease.leaseId },
    receipt: { ...receipt(), providerRequestId: "native-a" },
  });
  if (settled.outcome !== "settled") throw new Error("Fixture settlement failed");
  return settled.operation;
}

test("independent import workers replay once and CAS competing revisions durably", async () => {
  const f = await fixture(),
    client = f.connect();
  try {
    const op = await observed(f.store);
    const other = await createPostgresStore({ prisma: client, schema: f.schema, clock: f.clock });
    const first = await Promise.all([f.store.importBilling(bill()), other.importBilling(bill())]);
    expect(first.filter((r) => r.outcome === "imported" && !r.replayed)).toHaveLength(1);
    expect(first.filter((r) => r.outcome === "imported" && r.replayed)).toHaveLength(1);
    const imported = first.find((r) => r.outcome === "imported");
    if (imported?.outcome !== "imported") throw new Error("Fixture import failed");
    const revisions = await Promise.all(
      [f.store, other].map((store, i) =>
        store.importBilling(
          bill({
            expectedPreviousImportId: imported.record.id,
            fileHash: (i ? "b" : "c").repeat(64),
          }),
        ),
      ),
    );
    expect(revisions.filter((r) => r.outcome === "imported")).toHaveLength(1);
    expect(
      revisions.filter((r) => r.outcome === "rejected" && r.reason === "previous_import_conflict"),
    ).toHaveLength(1);
    await f.restart();
    expect((await f.store.getOperation(ref(op)))?.receipts).toHaveLength(3);
    expect(
      (
        await f.store.billingImports({
          scope: bill().scope,
          connection: "c1",
          ...window,
          history: true,
        })
      ).records,
    ).toHaveLength(2);
    expect(await f.store.importBilling(bill())).toEqual({
      outcome: "imported",
      replayed: true,
      record: imported.record,
    });
    expect((await f.store.getOperation(ref(op)))?.receipts).toHaveLength(3);
  } finally {
    await client.$disconnect();
    await f.close();
  }
});

test("a crash between operation update and journal insert rolls the whole import back", async () => {
  const f = await fixture();
  try {
    const op = await observed(f.store);
    const broken = await createPostgresStore({
      prisma: f.client(),
      schema: f.schema,
      clock: f.clock,
      testHooks: {
        afterOperationWrite: () => {
          throw new Error("injected import crash");
        },
      },
    });
    await expect(broken.importBilling(bill())).rejects.toThrow("injected import crash");
    await f.restart();
    expect(await f.store.getOperation(ref(op))).toEqual(op);
    expect(
      (
        await f.store.billingImports({
          scope: bill().scope,
          connection: "c1",
          ...window,
          history: true,
        })
      ).records,
    ).toEqual([]);
    expect((await f.store.importBilling(bill())).outcome).toBe("imported");
  } finally {
    await f.close();
  }
});

test("journal failure also rolls back receipt, usage, events and revision pointer", async () => {
  const f = await fixture();
  try {
    const op = await observed(f.store);
    await f
      .client()
      .$executeRaw(
        Prisma.raw(
          `CREATE FUNCTION "${f.schema}".deny_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected journal failure'; END $$`,
        ),
      );
    await f
      .client()
      .$executeRaw(
        Prisma.raw(
          `CREATE TRIGGER deny_import BEFORE INSERT ON "${f.schema}".metering_import FOR EACH ROW EXECUTE FUNCTION "${f.schema}".deny_import()`,
        ),
      );
    await expect(f.store.importBilling(bill())).rejects.toThrow("injected journal failure");
    expect(await f.store.getOperation(ref(op))).toEqual(op);
    for (const table of ["metering_import", "metering_import_family"])
      expect(
        await transactions(f.client(), f.schema, f.counters).read((sql) =>
          sql.query(Prisma.sql`SELECT * FROM ${Prisma.raw(table)}`),
        ),
      ).toEqual([]);
    await f
      .client()
      .$executeRaw(Prisma.raw(`DROP TRIGGER deny_import ON "${f.schema}".metering_import`));
    expect((await f.store.importBilling(bill())).outcome).toBe("imported");
    await expect(
      f
        .client()
        .$executeRaw(
          Prisma.sql`UPDATE ${Prisma.raw(`"${f.schema}".metering_import`)} SET provider='other'`,
        ),
    ).rejects.toThrow("immutable");
  } finally {
    await f.close();
  }
});

test("import snapshot waits for a concurrently committed native operation instead of inventing an unobserved charge", async () => {
  const f = await fixture(),
    writer = f.connect();
  let release!: () => void, entered!: () => void;
  const barrier = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pending: Promise<Operation> | undefined;
  try {
    pending = writer.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${f.schema}"`)}`);
        const store = await createTransactionBoundStore({ transaction: tx, clock: f.clock });
        const op = await observed(store);
        entered();
        await hold;
        return op;
      },
      { timeout: 30000 },
    );
    await barrier;
    const importing = f.store.importBilling(bill());
    let blocked = false;
    for (let n = 0; n < 100 && !blocked; n++) {
      const rows = await f.client().$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(
        SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0
          AND query LIKE '%pg_advisory_xact_lock%') AS blocked`;
      blocked = rows[0]?.blocked === true;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    release();
    const op = await pending;
    const result = await importing;
    expect(result).toMatchObject({
      outcome: "imported",
      record: { matchedOperationIds: [op.operationId], unobservedOperationIds: [] },
    });
    expect((await f.store.getOperation(ref(op)))?.receipts).toHaveLength(2);
  } finally {
    release();
    await pending?.catch(() => {});
    await writer.$disconnect();
    await f.close();
  }
});
