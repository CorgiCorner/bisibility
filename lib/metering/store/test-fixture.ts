import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@/lib/generated/prisma/client";
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
  },
  session?: { timeZone: "Europe/Warsaw" | "America/New_York" | "UTC" },
) {
  const url = testDatabaseUrl(),
    schema = options?.schema ?? `metering_${randomUUID().replaceAll("-", "")}`;
  const ingress = new URL(url);
  if (session) ingress.searchParams.set("options", `-c TimeZone=${session.timeZone}`);
  const connect = () =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: ingress.toString(), max: 5 }) });
  let prisma = options?.pooledClient ?? connect();
  if (!options) {
    await prisma.$executeRaw(Prisma.sql`CREATE SCHEMA ${Prisma.raw(schema)}`);
    const migrations = [
      "../../../prisma/migrations/20260924011626_metering_shadow/migration.sql",
      "../../../prisma/migrations/20261006070000_metering_contract/migration.sql",
      "../../../prisma/migrations/20261006072000_byok_metering_evidence/migration.sql",
      "../../../prisma/migrations/20261006072500_byok_metering_namespace/migration.sql",
      "../../../prisma/migrations/20261006072800_byok_metering_proof_revision/migration.sql",
      "../../../prisma/migrations/20261006075800_metering_imports/migration.sql",
      "../../../prisma/migrations/20261011010000_shared_paid_attempt_context/migration.sql",
      "../../../prisma/migrations/20261011020000_accounting_history_snapshot/migration.sql",
      "../../../prisma/migrations/20261012001000_metering_utc_writers/migration.sql",
      "../../../prisma/migrations/20261018190000_historical_financial_closeout/migration.sql",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(schema)}`);
      await tx.$executeRaw(Prisma.sql`CREATE TABLE queued_rank_check_tasks (id text PRIMARY KEY)`);
      for (const migration of migrations)
        for (const statement of migrationStatements(migration))
          await tx.$executeRaw(Prisma.raw(statement));
      await tx.$executeRaw`DROP TABLE IF EXISTS metering_shadow`;
    });
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
  return {
    store,
    clock,
    budgets,
    schema,
    url,
    client: () => prisma,
    connect,
    counters,
    syncBudgets: sync,
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
          await base.client().$transaction(async (tx) => {
            await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(base.schema)}`);
            await tx.$executeRaw(Prisma.sql`TRUNCATE TABLE
              metering_history_reference, metering_history_import, metering_paid_attempt_context, metering_operation, metering_receipt, metering_measurement, metering_command,
              metering_budget, metering_budget_usage, metering_event, metering_metadata,
              metering_alert, metering_request_command, metering_request_count,
              metering_usage_evidence,
              metering_import_family, metering_import,
              queued_rank_check_tasks RESTART IDENTITY CASCADE`);
          });
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

/**
 * Function bodies and line comments contain semicolons; keep dollar-quoted SQL intact and never
 * split inside a `--` comment for real fixture migrations.
 */
function migrationStatements(source: string) {
  const statements: string[] = [];
  let quoted = false,
    start = 0;
  for (const token of source.matchAll(/\$\$|--[^\n]*|;/g)) {
    if (token[0] === "$$") quoted = !quoted;
    else if (token[0] === ";" && !quoted) {
      const statement = source.slice(start, token.index).trim();
      if (statement) statements.push(statement);
      start = token.index + 1;
    }
  }
  const final = source.slice(start).trim();
  if (final) statements.push(final);
  return statements;
}
