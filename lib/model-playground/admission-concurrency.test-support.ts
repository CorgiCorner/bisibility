import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { fixture } from "@/lib/metering/store/test-fixture";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { PrismaPg } from "@prisma/adapter-pg";
import { fixtureDdl, migrationSql, paymentMigration } from "./admission.postgres.test-support";
import { createModelPaymentQuote } from "./payment";
import { paymentContext } from "./payment.test-support";

// Match transport-admission.integration.test.ts: scope Prisma delegates AND raw statements.
export async function postgresPaymentFixture() {
  const context = paymentContext();
  const quote = createModelPaymentQuote(context);
  const f = await fixture();
  const url = new URL(f.url);
  url.searchParams.set("options", `-c search_path=${f.schema}`);
  const connect = () =>
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }, { schema: f.schema }),
    });
  const primary = connect();
  const second = connect();
  const scoped = (client: PrismaClient) =>
    ({
      $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
        client.$transaction(
          async (tx) => {
            await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
            return body(tx);
          },
          { timeout: 30000 },
        ),
    }) as unknown as Pick<PrismaClient, "$transaction">;
  const first = scoped(primary);
  await first.$transaction(async (tx) => {
    // These tables are absent in the Meter fixture, so historical migration discovery stays unchanged.
    for (const statement of fixtureDdl
      .replace("CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY);", "")
      .split(";")
      .filter((s) => s.trim()))
      await tx.$executeRawUnsafe(statement);
    // One query through pg supports the trigger's dollar-quoted function body.
  });
  const migration = await migrationSql(paymentMigration);
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await pool.query(`SET search_path TO "${f.schema}"`);
    await pool.query(migration);
  } finally {
    await pool.end();
  }
  const b = context.columns[0].binding;
  b.credentialVersion =
    ownCredentialVersion(b.column.providerId, b.connectionId, "fixture-envelope") ?? "";
  const current = createModelPaymentQuote(context);
  Object.assign(quote, current);
  await first.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO users VALUES('actor',NULL),(${context.principal},NULL)`;
    await tx.$executeRaw`INSERT INTO projects VALUES(${context.projectId},${context.principal})`;
    await tx.$executeRaw`INSERT INTO memberships VALUES(${randomUUID()},'actor',${context.projectId},'member')`;
    await tx.$executeRaw`INSERT INTO provider_connections VALUES(${b.connectionId},${context.projectId},${b.column.connectionId},${b.column.providerId},'model','own','fixture-envelope',true,'connected')`;
    await createTransactionBoundStore({
      transaction: tx,
      clock: { now: () => new Date() },
    });
    await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
      id: context.budget.id,
      version: 1,
      scope: { kind: "group", namespace: context.namespace, group: context.projectId },
      surface: "any",
      unit: "budget_cents",
      limit: { unit: "budget_cents", value: 5n, scale: 0 },
      onExceed: "block",
      window: { kind: "calendar_month", timezone: "UTC" },
    });
  });
  return {
    ...f,
    second,
    client: () => primary,
    scoped,
    context,
    quote,
    async close() {
      await Promise.all([primary.$disconnect(), second.$disconnect()]);
      await f.close();
    },
  };
}
