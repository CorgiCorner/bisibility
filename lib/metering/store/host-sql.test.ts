import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { expect, test, vi } from "vitest";
import { createSql, lock, transactions } from "./host-sql";

function client(marker: string | null = "utc-core-v2-fence-presence-v1") {
  const order: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (query: Prisma.Sql) => {
      order.push(query.text);
      return 1;
    }),
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      order.push(query.text);
      return [{ acquired: true, value: 42 }];
    }),
    $queryRawUnsafe: vi.fn(async (text: string) => {
      order.push(text);
      if (text.includes("FROM pg_trigger"))
        return [
          {
            tables: [
              "metering_event",
              "metering_history_progress",
              "metering_import",
              "metering_operation",
              "metering_paid_attempt_context",
              "metering_receipt",
            ],
          },
        ];
      return marker ? [{ value: marker }] : [];
    }),
    $executeRawUnsafe: vi.fn(async (text: string) => {
      order.push(text);
      return 1;
    }),
  };
  const db = { $transaction: vi.fn(async (body: (transaction: typeof tx) => unknown) => body(tx)) };
  const counters = { statements: 0, changes: 0n, rowsRead: 0 };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    db: db as unknown as PrismaClient,
    order,
    counters,
    raw: tx,
  };
}

test.each(["query", "execute", "lock"])(
  "direct %s refuses an unadopted ledger before application SQL",
  async (kind) => {
    const f = client(null);
    const sql = createSql(f.tx, f.counters);
    const attempt =
      kind === "query"
        ? sql.query(Prisma.sql`SELECT 42 AS value`)
        : kind === "execute"
          ? sql.execute(Prisma.sql`INSERT INTO host_mutation VALUES (42)`)
          : lock(sql, "host-mutation");
    await expect(attempt).rejects.toThrow("requires prior UTC write adoption");
    expect(f.raw.$queryRaw).not.toHaveBeenCalled();
    expect(f.raw.$executeRaw.mock.calls.map(([query]) => query.text)).toEqual([
      "SET LOCAL TIME ZONE 'UTC'",
    ]);
    expect(f.raw.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(f.counters).toEqual({ statements: 0, changes: 0n, rowsRead: 0 });
  },
);

test("direct SQL verifies once after setting UTC and never bootstraps history", async () => {
  const f = client();
  const sql = createSql(f.tx, f.counters);
  await sql.query(Prisma.sql`SELECT 42 AS value`);
  await sql.execute(Prisma.sql`UPDATE host_mutation SET value = 42`);
  await lock(sql, "host-mutation");
  expect(f.order[0]).toBe("SET LOCAL TIME ZONE 'UTC'");
  expect(f.order.findIndex((text) => text.includes("FROM pg_trigger"))).toBeLessThan(
    f.order.indexOf("SELECT 42 AS value"),
  );
  expect(
    f.raw.$queryRawUnsafe.mock.calls.filter(([text]) => text.includes("FROM pg_trigger")),
  ).toHaveLength(1);
  expect(f.raw.$executeRawUnsafe).not.toHaveBeenCalled();
  expect(f.counters).toEqual({ statements: 3, changes: 1n, rowsRead: 2 });
});

test("read transactions establish controls before verifying and cannot bootstrap a marker", async () => {
  const f = client(null);
  const body = vi.fn();
  await expect(transactions(f.db, "owned_ledger", f.counters).read(body)).rejects.toThrow(
    "requires prior UTC write adoption",
  );
  expect(body).not.toHaveBeenCalled();
  expect(f.order.slice(0, 3)).toEqual([
    "SET LOCAL TIME ZONE 'UTC'",
    "SET TRANSACTION READ ONLY",
    'SET LOCAL search_path TO "owned_ledger"',
  ]);
  expect(f.order.some((text) => /LOCK TABLE|INSERT INTO metering_metadata/.test(text))).toBe(false);
});
