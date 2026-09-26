import { expect, test } from "vitest";
import { createPostgresStore } from "./index";
import { Prisma } from "./sql";
import { bound, command, receipt, request } from "./test-data";
import { fixture } from "./test-fixture";

test("two independent Prisma clients race for one slot in twenty epochs", async () => {
  const f = await fixture(),
    client = f.connect();
  try {
    const second = await createPostgresStore({ prisma: client, schema: f.schema, clock: f.clock });
    for (let n = 1; n <= 20; n++) {
      await f.store.putBudget(bound(n));
      const results = await Promise.all([f.store.reserve(request()), second.reserve(request())]);
      expect(results.map((r) => r.outcome).sort()).toEqual(["exceeded", "reserved"]);
    }
    console.info(
      "Postgres admission race: 20/20 epochs, two independent Prisma clients, exactly one winner each",
    );
  } finally {
    await client.$disconnect();
    await f.close();
  }
});

test("a failure after the operation write rolls back operation and budget projection", async () => {
  const f = await fixture();
  try {
    await f.store.putBudget(bound());
    const broken = await createPostgresStore({
      prisma: f.client(),
      schema: f.schema,
      clock: f.clock,
      testHooks: {
        afterOperationWrite: () => {
          throw new Error("injected crash");
        },
      },
    });
    await expect(broken.reserve(request())).rejects.toThrow("injected crash");
    const tables = ["metering_operation", "metering_budget_usage", "metering_event"];
    for (const table of tables) {
      const [row] = await f
        .client()
        .$queryRaw<{ n: bigint }[]>(
          Prisma.sql`SELECT count(*) AS n FROM ${Prisma.raw(`"${f.schema}"."${table}"`)}`,
        );
      expect(row?.n).toBe(0n);
    }
  } finally {
    await f.close();
  }
});

test("budget version check and write are atomic across two clients", async () => {
  const f = await fixture(),
    client = f.connect();
  try {
    const second = await createPostgresStore({ prisma: client, schema: f.schema, clock: f.clock });
    const results = await Promise.all([f.store.putBudget(bound()), second.putBudget(bound())]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["conflict", "saved"]);
  } finally {
    await client.$disconnect();
    await f.close();
  }
});

test("failed compare-and-set maps to a dispatch version conflict", async () => {
  const f = await fixture();
  try {
    const reserved = await f.store.reserve(request());
    if (reserved.outcome !== "reserved") throw new Error("fixture");
    await f
      .client()
      .$executeRaw(
        Prisma.raw(
          `CREATE FUNCTION "${f.schema}".deny_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`,
        ),
      );
    await f
      .client()
      .$executeRaw(
        Prisma.raw(
          `CREATE TRIGGER deny_update BEFORE UPDATE ON "${f.schema}".metering_operation FOR EACH ROW EXECUTE FUNCTION "${f.schema}".deny_update()`,
        ),
      );
    expect(
      await f.store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "worker",
        leaseTtlMs: 1000,
      }),
    ).toMatchObject({
      granted: false,
      reason: "version_conflict",
      operation: { state: "reserved", version: 1 },
    });
  } finally {
    await f.close();
  }
});

test("a receipt correction cannot change rows inside an existing cursor chain", async () => {
  const f = await fixture();
  try {
    const operations = [];
    for (const provider of ["a", "b"]) {
      const r = await f.store.reserve({ ...request(), provider });
      if (r.outcome !== "reserved") throw new Error("fixture");
      const g = await f.store.markDispatchIntent({
        ...command(r.operation),
        holder: "w",
        leaseTtlMs: 1000,
      });
      if (!("granted" in g) || !g.granted) throw new Error("fixture");
      const result = await f.store.settle({
        ...command(g.operation),
        authority: { kind: "lease", leaseId: g.lease.leaseId },
        receipt: receipt(),
      });
      if (result.outcome !== "settled") throw new Error("fixture");
      operations.push(result.operation);
    }
    const query = {
      scope: { kind: "namespace" as const, namespace: "test" },
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      units: ["requests"],
      groupBy: ["provider" as const],
      limit: 1,
    };
    const first = await f.store.aggregate(query),
      op = operations[1];
    if (!op) throw new Error("fixture");
    await f.store.correct({
      ...command(op),
      authority: { kind: "late_evidence", source: "provider" },
      replacesReceiptId: op.receipts[0]?.id ?? "",
      reason: "measured",
      receipt: {
        ...receipt(),
        cost: { certainty: "measured", money: { units: 100n, currency: "USD" } },
      },
    });
    const second = await f.store.aggregate({ ...query, cursor: first.nextCursor });
    expect(second.rows[0]?.cost.money?.units).toBe(1n);
    expect(second.watermark).toBe(first.watermark);
  } finally {
    await f.close();
  }
});

test("budget reads retain definition order independently of random identifiers", async () => {
  const f = await fixture();
  try {
    await f.store.putBudget({ ...bound(), id: "z-first" });
    await f.store.putBudget({ ...bound(), id: "a-second", limit: null });
    expect((await f.store.listBudgets("test")).map((b) => b.id)).toEqual(["z-first", "a-second"]);
  } finally {
    await f.close();
  }
});
