import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { createManualClock } from "@usagekit/store";
import { type PostgresDriver, prismaPostgresExecutor } from "@usagekit/store-postgres";
import { expect, test, vi } from "vitest";
import { createPostgresStore } from "./index";
import { interceptExecute } from "./intercept-execute.test-fixture";
import { utcPostgresDriver } from "./timestamp-policy";
import { createTransactionBoundStore } from "./transactional";

function client() {
  const transaction = {
    $queryRawUnsafe: vi.fn(async (query: string, ...values: unknown[]) => {
      if (query.includes("FROM pg_trigger"))
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
      return [
        {
          value:
            values[0] === "bisibility.utc_timestamp_contract"
              ? "utc-core-v2-fence-presence-v1"
              : "retained-cursor-key",
        },
      ];
    }),
    $executeRawUnsafe: vi.fn(async (_query: string, ..._values: unknown[]) => 1),
    $executeRaw: vi.fn(async () => 1),
  };
  const database = {
    $transaction: vi.fn(async (run: (tx: typeof transaction) => unknown) => run(transaction)),
  };
  return {
    transaction: transaction as unknown as Prisma.TransactionClient,
    database: database as unknown as PrismaClient,
    execute: transaction.$executeRawUnsafe,
    query: transaction.$queryRawUnsafe,
    begin: database.$transaction,
  };
}

test.each(["public; DROP SCHEMA public", "UPPERCASE", "a".repeat(64)])(
  "rejects invalid schemas before opening a host transaction: %s",
  async (schema) => {
    const f = client();
    await expect(
      createPostgresStore({ prisma: f.database, clock: createManualClock(), schema }),
    ).rejects.toThrow("schema");
    expect(f.begin).not.toHaveBeenCalled();
  },
);

test("retains the existing metadata key and binds a non-default schema without runtime DDL", async () => {
  const f = client();
  const counters = { statements: 0, changes: 0n, rowsRead: 0 };
  const store = await createPostgresStore({
    prisma: f.database,
    schema: "owned_preview",
    clock: createManualClock(),
    counters,
  });
  expect(store.counters).toBe(counters);
  expect(f.query.mock.calls[0]).toEqual([
    "SELECT set_config('search_path', $1, true)",
    '"owned_preview"',
  ]);
  expect(f.query.mock.calls.at(-1)?.[0]).toContain("SELECT value FROM metering_metadata");
  expect(f.execute.mock.calls.flat().join(" ")).not.toMatch(/CREATE|ALTER|DROP/);
});

test("joined initialization does not open or commit a transaction or change its search_path", async () => {
  const f = client();
  await createTransactionBoundStore({ transaction: f.transaction, clock: createManualClock() });
  expect(f.begin).not.toHaveBeenCalled();
  expect(f.query.mock.calls.flat().join(" ")).not.toMatch(/search_path|BEGIN|COMMIT/);
});

test("initialization failure reaches the caller without selecting a native fallback", async () => {
  const f = client();
  f.execute.mockRejectedValueOnce(new Error("missing host schema"));
  await expect(
    createPostgresStore({ prisma: f.database, clock: createManualClock() }),
  ).rejects.toThrow("missing host schema");
  expect(f.transaction.$executeRaw).not.toHaveBeenCalled();
});

test("receipt crash barriers cover the shared executor and preserve bound parameters", async () => {
  const f = client();
  const proxy = interceptExecute(f.transaction, async (text, execute) => {
    if (text.includes("INSERT INTO metering_receipt")) throw new Error("receipt crash");
    return execute();
  });
  await expect(
    proxy.$executeRawUnsafe("INSERT INTO metering_receipt VALUES ($1)", "proof"),
  ).rejects.toThrow("receipt crash");
  expect(f.execute).not.toHaveBeenCalled();
  await proxy.$executeRawUnsafe("INSERT INTO host_proof VALUES ($1)", "bound-secret");
  expect(f.execute).toHaveBeenCalledWith("INSERT INTO host_proof VALUES ($1)", "bound-secret");
});

test("native SQL crash barriers remain active for host transaction writes", async () => {
  const f = client();
  const proxy = interceptExecute(f.transaction, async (text, execute) => {
    if (text.includes("INSERT INTO host_proof")) throw new Error("host crash");
    return execute();
  });
  await expect(
    proxy.$executeRaw(Prisma.sql`INSERT INTO host_proof VALUES(${"proof"})`),
  ).rejects.toThrow("host crash");
  expect(f.transaction.$executeRaw).not.toHaveBeenCalled();
});

test.each(["body", "commit"] as const)(
  "UTC initialization is retried after a %s failure",
  async (failure) => {
    const f = client();
    const executor = prismaPostgresExecutor(f.transaction);
    let fail = true;
    const driver: PostgresDriver = {
      async transaction(_readOnly, body) {
        const result = await body(executor);
        if (failure === "commit" && fail) throw new Error("commit failure");
        return result;
      },
    };
    const utc = utcPostgresDriver(driver, "public");
    await expect(
      utc.transaction(false, async () => {
        if (failure === "body") throw new Error("body failure");
      }),
    ).rejects.toThrow(`${failure} failure`);
    fail = false;
    await utc.transaction(false, async () => 42);
    expect(f.query.mock.calls.filter(([text]) => text.includes("FROM pg_trigger"))).toHaveLength(2);
  },
);

test("a cold read-only UTC driver requires prior adoption without running a write audit", async () => {
  const f = client();
  const read = f.query.getMockImplementation();
  f.query.mockImplementation(async (text, ...values) =>
    text.includes("SELECT value FROM metering_metadata") ? [] : (read?.(text, ...values) ?? []),
  );
  const executor = prismaPostgresExecutor(f.transaction);
  const driver: PostgresDriver = { transaction: async (_readOnly, body) => body(executor) };
  const utc = utcPostgresDriver(driver, "public");
  const body = vi.fn();
  await expect(utc.transaction(true, body)).rejects.toThrow(
    "read path requires prior UTC write adoption",
  );
  expect(body).not.toHaveBeenCalled();
  expect(f.query.mock.calls.some(([text]) => text.includes("pg_advisory_xact_lock"))).toBe(false);
  expect(
    f.execute.mock.calls.some(([text]) => /LOCK TABLE|INSERT INTO metering_metadata/.test(text)),
  ).toBe(false);
});
