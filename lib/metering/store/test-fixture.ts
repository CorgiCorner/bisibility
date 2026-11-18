import { randomUUID } from "node:crypto";
import { PrismaClient } from "@/lib/generated/prisma/client";
import {
  applyFixtureMigration,
  initializeFixtureSchema,
  moneyMigration,
  resetFixtureTables,
} from "@/lib/metering/store/fixture-schema.test-fixture";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Budget } from "@usagekit/core";
import { createManualClock } from "@usagekit/store";
import type { ScalingFixture, StoreFactory } from "@usagekit/store/conformance";
import { saveBudget } from "./budgets";
import { encode } from "./codec";
import { Prisma, transactions } from "./host-sql";
import { createPostgresStore } from "./index";

export function testDatabaseUrl() {
  const value = process.env.METERING_TEST_DATABASE_URL;
  if (!value)
    throw new Error("METERING_TEST_DATABASE_URL is required for real Postgres integration tests");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "postgres"].includes(url.hostname))
    throw new Error("Metering integration requires an isolated local or CI database");
  return value;
}
export async function fixture(
  options?: {
    schema: string;
    pooledClient: PrismaClient;
    resetOnClose: () => Promise<void>;
    url?: string;
    connect?: () => PrismaClient;
  },
  session?: { timeZone: "Europe/Warsaw" | "America/New_York" | "UTC" },
  setupTimeoutMs = 30000,
) {
  const url = options?.url ?? testDatabaseUrl(),
    schema = options?.schema ?? `metering_${randomUUID().replaceAll("-", "")}`;
  const ingress = new URL(url);
  if (session) ingress.searchParams.set("options", `-c TimeZone=${session.timeZone}`);
  const connect =
    options?.connect ??
    (() =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: ingress.toString(), max: 5 }),
      }));
  let prisma = options?.pooledClient ?? connect();
  if (!options) {
    await prisma.$executeRaw(Prisma.sql`CREATE SCHEMA ${Prisma.raw(schema)}`);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(schema)}`);
        await initializeFixtureSchema(tx);
      },
      { timeout: setupTimeoutMs, maxWait: 10000 },
    );
  }
  const clock = createManualClock(),
    budgets: Budget[] = [],
    seen = new Map<string, string>(),
    counters = { statements: 0, changes: 0n, rowsRead: 0 };
  let current = await createPostgresStore({ prisma, clock, schema, counters });
  let syncing = Promise.resolve();
  const sync = () =>
    (syncing = syncing.then(async () => {
      for (const b of budgets) {
        const k = `${b.scope.namespace}:${b.id}:${b.version}`,
          value = encode(b);
        if (seen.get(k) !== value) {
          await transactions(prisma, schema, counters).write((sql) => saveBudget(sql, b, true));
          seen.set(k, value);
        }
      }
    }));
  const store = new Proxy(current, {
    get(_target, name) {
      const value = current[name as keyof typeof current];
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await sync();
        return Reflect.apply(value, current, args);
      };
    },
  });
  const result = {
    store,
    clock,
    budgets,
    schema,
    url,
    client: () => prisma,
    connect,
    counters,
    syncBudgets: sync,
    async moneyColumns() {
      const rows = await transactions(prisma, schema, counters).read((sql) =>
        sql.query<{ cost_units: string; cost_scale: number }>(Prisma.sql`
          SELECT cost_units::text,cost_scale FROM metering_receipt ORDER BY recorded_at,receipt_pk`),
      );
      return rows.sort((a, b) => a.cost_scale - b.cost_scale);
    },
    async replayMoneyMigration() {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw(Prisma.sql`SET LOCAL TIME ZONE 'UTC'`);
          await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(schema)}`);
          // Retry the actual migration against current rows; never fabricate a downgrade.
          await applyFixtureMigration(tx, moneyMigration);
        },
        { timeout: 30000, maxWait: 10000 },
      );
    },
    async restart() {
      await prisma.$disconnect();
      prisma = connect();
      current = await createPostgresStore({ prisma, clock, schema, counters });
      return store;
    },
    async close() {
      if (options) {
        if (prisma !== options.pooledClient) await prisma.$disconnect();
        await options.resetOnClose();
      } else {
        await prisma.$executeRaw(Prisma.sql`DROP SCHEMA ${Prisma.raw(schema)} CASCADE`);
        await prisma.$disconnect();
      }
    },
  };
  return result satisfies Required<Awaited<ReturnType<StoreFactory>>>;
}
export const createFixture: StoreFactory = fixture;
let conformancePool: Promise<Awaited<ReturnType<typeof fixture>>> | undefined;
let conformanceInUse = false;
export async function createConformanceFixture() {
  if (conformanceInUse) throw new Error("A conformance fixture is already active");
  conformanceInUse = true;
  try {
    if (!conformancePool) conformancePool = fixture();
    const base = await conformancePool;
    return await fixture({
      schema: base.schema,
      pooledClient: base.client(),
      async resetOnClose() {
        try {
          await resetFixtureTables(base.client(), base.schema);
        } finally {
          conformanceInUse = false;
        }
      },
    });
  } catch (error) {
    conformanceInUse = false;
    if (conformancePool) {
      try {
        await conformancePool;
      } catch {
        conformancePool = undefined;
      }
    }
    throw error;
  }
}
export async function closeConformanceFixturePool() {
  if (conformanceInUse) throw new Error("Cannot close an active conformance fixture");
  await (await conformancePool)?.close();
  conformancePool = undefined;
}
export async function createScalingFixture(): Promise<ScalingFixture> {
  const f = await fixture();
  return {
    store: f.store,
    snapshot: () => ({ ...f.counters }),
    close: f.close,
    async readOnly(run) {
      // Every adapter read explicitly starts SET TRANSACTION READ ONLY. A write fails in Postgres.
      await run();
    },
  };
}
