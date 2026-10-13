import { expect, test } from "vitest";
import { saveBudget } from "./budgets";
import { Prisma, transactions } from "./host-sql";
import { createPostgresStore } from "./index";
import { operationsReader } from "./operations";
import { bound, request } from "./test-data";
import { fixture } from "./test-fixture";

const query = {
  scope: { kind: "namespace" as const, namespace: "test" },
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-10-01T00:00:00.000Z",
  limit: 1,
};

test("existing native cursors and shared cursors continue in both directions after reopen", async () => {
  const f = await fixture();
  try {
    await f.store.reserve(request("before-one"));
    f.clock.advance(1000);
    await f.store.reserve(request("before-two"));
    const nativePage = (input: typeof query & { cursor?: string }) =>
      transactions(f.client(), f.schema, f.counters).read(async (sql) => {
        const [metadata] = await sql.query<{ value: string }>(
          Prisma.sql`SELECT value FROM metering_metadata WHERE key='cursor_key'`,
        );
        if (!metadata) throw new Error("Missing retained cursor metadata");
        return operationsReader(f.clock, metadata.value)(sql, input);
      });
    const native = await nativePage(query);
    const shared = await f.store.listOperations(query);
    expect(shared).toEqual(native);
    expect(native.nextCursor).toBeTruthy();
    f.clock.advance(1000);
    await f.store.reserve(request("after-snapshot"));
    await f.restart();
    const second = await f.store.listOperations({ ...query, cursor: native.nextCursor });
    expect(second).toEqual(await nativePage({ ...query, cursor: shared.nextCursor }));
    expect(second.operations.map((op) => op.operationId)).toEqual(["before-two"]);
    expect(second.nextCursor).toBeUndefined();
    expect(second.asOf).toBe(native.asOf);
    expect(second.watermark).toBe(native.watermark);
  } finally {
    await f.close();
  }
});

test("native budget changes serialize shared admission while another namespace remains independent", async () => {
  const f = await fixture(),
    writer = f.connect(),
    other = f.connect();
  let entered!: () => void, release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let changing: Promise<unknown> | undefined;
  let admitting: Promise<unknown> | undefined;
  try {
    changing = transactions(writer, f.schema, f.counters).write(async (sql) => {
      const budget = bound();
      await saveBudget(sql, { ...budget, limit: { unit: "requests", value: 0n, scale: 0 } });
      entered();
      await hold;
    });
    await barrier;
    admitting = f.store.reserve(request("blocked-by-native-budget"));
    let blocked = false;
    for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
      const [row] = await f.client().$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(
        SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND cardinality(pg_blocking_pids(pid))>0
        AND query LIKE '%pg_advisory_xact_lock%') AS blocked`;
      blocked = row?.blocked === true;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    const independent = await createPostgresStore({
      prisma: other,
      schema: f.schema,
      clock: f.clock,
    });
    const separate = request("other-namespace");
    expect(
      await independent.reserve({ ...separate, scope: { ...separate.scope, namespace: "other" } }),
    ).toMatchObject({ outcome: "reserved" });
    release();
    await changing;
    expect(await admitting).toMatchObject({ outcome: "exceeded" });
  } finally {
    release();
    await changing?.catch(() => {});
    await admitting?.catch(() => {});
    await writer.$disconnect();
    await other.$disconnect();
    await f.close();
  }
});
