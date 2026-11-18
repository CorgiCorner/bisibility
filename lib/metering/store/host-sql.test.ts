import { readFileSync } from "node:fs";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { Operation } from "@usagekit/core";
import { expect, test, vi } from "vitest";
import { appendReceipt } from "./records";
import { receipt, request } from "./test-data";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.resolve("@usagekit/store-postgres")), "utf8"),
);
const [release, prerelease] = version.split("-");
expect(
  release.localeCompare("0.12.0", undefined, { numeric: true }) > 0 ||
    (release === "0.12.0" && prerelease === undefined),
  "This branch requires the published 0.12.0 lockfile; install store-postgres >= 0.12.0",
).toBe(true);

const { createSql, lock, transactions } = await import("./host-sql");

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
  const verificationIndex = f.order.findIndex((text) => text.includes("FROM pg_trigger"));
  const queryIndex = f.order.indexOf("SELECT 42 AS value");
  expect(verificationIndex).toBeGreaterThanOrEqual(0);
  expect(queryIndex).toBeGreaterThanOrEqual(0);
  expect(verificationIndex).toBeLessThan(queryIndex);
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

test.each([4, 8])(
  "active port adapts the pinned receipt writer at scale %i after verification",
  async (scale) => {
    const f = client();
    const sql = createSql(f.tx, f.counters);
    const value = {
      ...receipt(),
      cost: {
        certainty: "measured" as const,
        money: { currency: "USD" as const, units: 13n, scale },
      },
    };
    await appendReceipt(sql, { ...request("mapped") } as Operation, value, 0);
    const mapped = f.raw.$executeRaw.mock.calls.find(([query]) =>
      query.text.startsWith("INSERT INTO metering_receipt"),
    )?.[0];
    expect(mapped?.text).toContain("sequence,cost_scale)");
    expect(mapped?.values.at(-1)).toBe(scale);
    expect(JSON.parse(String(mapped?.values[4])).cost.money.scale).toBe(
      scale === 4 ? undefined : scale,
    );
    const verificationIndex = f.order.findIndex((text) => text.includes("FROM pg_trigger"));
    const insertIndex = f.order.findIndex((text) =>
      text.startsWith("INSERT INTO metering_receipt"),
    );
    expect(verificationIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(verificationIndex).toBeLessThan(insertIndex);
    expect(value.cost.money.scale).toBe(scale);
  },
);
