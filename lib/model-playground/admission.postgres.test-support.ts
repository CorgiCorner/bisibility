import { readFile } from "node:fs/promises";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { afterAll, beforeEach, vi } from "vitest";
import { admitModelRun, type ModelAdmissionPorts, saveModelPaymentQuote } from "./admission";
import { fixtureSchema, launchTestDatabase } from "./launch-database.test-support";
import { createModelPaymentQuote, type ModelPaymentContext } from "./payment";
import { paymentContext } from "./payment.test-support";

export const paymentMigration = "20261112230000_model_playground_admission";
export const paymentMigrations = [
  "20260924011626_metering_shadow",
  "20261006070000_metering_contract",
  "20261006072000_byok_metering_evidence",
  "20261006072500_byok_metering_namespace",
  "20261006072800_byok_metering_proof_revision",
  "20261006075800_metering_imports",
  "20261011010000_shared_paid_attempt_context",
  "20261011020000_accounting_history_snapshot",
  "20261012001000_metering_utc_writers",
  "20261112220000_metering_native_settlement",
  paymentMigration,
];
type Query = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
};
export const fixtureDdl = `CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY);
  CREATE TABLE instance_settings(key text PRIMARY KEY,value text);
  CREATE TABLE users(id text PRIMARY KEY,"deactivatedAt" timestamptz);
  CREATE TABLE projects(id text PRIMARY KEY,"ownerId" text,"writeMode" text DEFAULT 'active');
  CREATE TABLE memberships(id text PRIMARY KEY,"userId" text,"projectId" text,role text);
  CREATE TABLE provider_connections(id text PRIMARY KEY,"projectId" text,"publicId" text,
    provider text,kind text,"credentialSource" text,"credentialsEncrypted" text,enabled boolean,status text);`;

export async function migrationSql(name: string) {
  return readFile(
    new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url),
    "utf8",
  );
}

/** Small Prisma delegate bridge; all accounting, uniqueness, triggers and rollback are real SQL. */
export function paymentSqlClient(sql: Query, trace: string[] = []): Prisma.TransactionClient {
  const tracedQuery = <T>(text: string, values: unknown[] = []) => {
    trace.push(text);
    return sql.query<T>(text, values);
  };
  const raw = (query: Prisma.Sql | TemplateStringsArray, values: unknown[]) => {
    const compiled = Array.isArray(query) ? Prisma.sql(query, ...values) : (query as Prisma.Sql);
    return tracedQuery(compiled.text, compiled.values);
  };
  const find = async (id: string) =>
    (await tracedQuery("SELECT * FROM metering_usage_evidence WHERE id=$1", [id])).rows[0] ?? null;
  const writeEvidence = async (id: string | null, data: Record<string, unknown>) => {
    const entries = Object.entries(data);
    const keys = [
      "id",
      "namespace",
      "principal",
      "projectId",
      "connectionId",
      "provider",
      "feature",
      "source",
      "correlationId",
      "unit",
      "estimate",
      "receipt",
      "proofVersion",
      "providerRequestId",
      "canonicalId",
      "measurementStatus",
      "createdAt",
    ];
    if (entries.some(([key]) => !keys.includes(key))) throw new Error("Unexpected fixture field");
    const values = entries.map(([key, value]) =>
      ["estimate", "receipt"].includes(key) ? JSON.stringify(value) : value,
    );
    const query =
      id === null
        ? `INSERT INTO metering_usage_evidence(${entries.map(([key]) => `"${key}"`).join(",")}) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`
        : `UPDATE metering_usage_evidence SET ${entries.map(([key], i) => `"${key}"=$${i + 1}`).join(",")} WHERE id=$${values.length + 1} RETURNING *`;
    return (await tracedQuery(query, id === null ? values : [...values, id])).rows[0];
  };
  return {
    instanceSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        (await tracedQuery("SELECT value FROM instance_settings WHERE key=$1", [where.key]))
          .rows[0] ?? null,
    },
    $queryRaw: async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) =>
      (await raw(query, values)).rows,
    $executeRaw: async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) =>
      (await raw(query, values)).affectedRows ?? 0,
    $queryRawUnsafe: async (text: string, ...values: unknown[]) =>
      (await tracedQuery(text, values)).rows,
    $executeRawUnsafe: async (text: string, ...values: unknown[]) =>
      (await tracedQuery(text, values)).affectedRows ?? 0,
    meteringUsageEvidence: {
      findUnique: async ({ where }: { where: { id: string } }) => find(where.id),
      findFirst: async ({
        where,
      }: {
        where: {
          connectionId: string;
          providerRequestId: string;
          id: { not: string };
          discarded: boolean;
        };
      }) =>
        (
          await tracedQuery(
            `SELECT * FROM metering_usage_evidence WHERE "connectionId"=$1 AND "providerRequestId"=$2 AND id<>$3 AND discarded=false ORDER BY id LIMIT 1`,
            [where.connectionId, where.providerRequestId, where.id.not],
          )
        ).rows[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => writeEvidence(null, data),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        writeEvidence(where.id, data),
    },
  } as unknown as Prisma.TransactionClient;
}

export function paymentHarness() {
  // pg_catalog must follow the fixture schema on every pooled connection: PostgreSQL searches an
  // unlisted pg_catalog first, which would bypass the fixture clock_timestamp() below.
  const sql = launchTestDatabase(
    process.env.MODEL_LAUNCH_TEST_DATABASE_URL,
    `${fixtureSchema("payment_fixture")},pg_catalog`,
  );
  const statements: string[] = [];
  const database = {
    $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      sql.transaction(async (tx) => {
        await tx.query("UPDATE model_test_clock SET now=$1", [now]);
        return body(paymentSqlClient(tx, statements));
      }),
  } as unknown as Pick<PrismaClient, "$transaction">;
  const now = new Date("2026-11-12T00:00:00Z");
  let live: ModelPaymentContext;
  const ports: ModelAdmissionPorts = { readCurrent: async () => live, now: () => now };
  beforeEach(async () => {
    statements.length = 0;
    now.setTime(Date.parse("2026-11-12T00:00:00Z"));
    vi.useRealTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Offline fixture attempted network");
      }),
    );
    await sql.exec(
      `DROP SCHEMA IF EXISTS ${fixtureSchema("payment_fixture")} CASCADE; CREATE SCHEMA ${fixtureSchema("payment_fixture")}; SET search_path TO ${fixtureSchema("payment_fixture")},pg_catalog; SET TIME ZONE 'UTC'; CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY)`,
    );
    // SQL clock travel for lifecycle tests; production SQL and guards remain unchanged.
    await sql.exec(`CREATE TABLE model_test_clock(now timestamptz NOT NULL);
      CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql AS 'SELECT now FROM model_test_clock';`);
    await sql.query("INSERT INTO model_test_clock VALUES($1)", [now]);
    for (const migration of paymentMigrations) await sql.exec(await migrationSql(migration));
    await sql.exec(
      fixtureDdl.replace("CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY);", ""),
    );
    const c = paymentContext();
    await sql.query(`INSERT INTO users VALUES('actor',NULL),($1,NULL)`, [c.principal]);
    await sql.query(`INSERT INTO projects VALUES($1,$2)`, [c.projectId, c.principal]);
    await sql.query(`INSERT INTO memberships VALUES('member','actor',$1,'member')`, [c.projectId]);
    await sql.query(
      `INSERT INTO provider_connections VALUES($1,$2,$3,$4,'model','own','encrypted-fixture',true,'connected')`,
      [
        c.columns[0].binding.connectionId,
        c.projectId,
        c.input.columns[0].connectionId,
        c.input.columns[0].providerId,
      ],
    );
    await database.$transaction(async (tx) => {
      await createTransactionBoundStore({
        transaction: tx,
        clock: { now: () => now },
      });
      await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
        id: c.budget.id,
        version: 1,
        scope: { kind: "group", namespace: c.namespace, group: c.projectId },
        surface: "any",
        unit: "budget_cents",
        limit: { unit: "budget_cents", value: 100n, scale: 0 },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      });
    });
  });
  afterAll(() => sql.close());
  async function quote(count = 1, configure?: (context: ModelPaymentContext) => void) {
    live = paymentContext(count);
    for (const { binding: b } of live.columns)
      b.credentialVersion =
        ownCredentialVersion(b.column.providerId, b.connectionId, "encrypted-fixture") ?? "";
    configure?.(live);
    const quote = createModelPaymentQuote(live, now);
    await saveModelPaymentQuote(database, quote);
    return quote;
  }
  const consent = (q: Awaited<ReturnType<typeof quote>>) => ({
    quoteId: q.quoteId,
    actorId: q.context.actorId,
    projectId: q.context.projectId,
    configHash: q.configHash,
    consent: "non_guaranteed_estimate_v1" as const,
  });
  return {
    sql,
    database,
    ports,
    now,
    quote,
    consent,
    statements,
    live: () => live,
    admit: (q: Awaited<ReturnType<typeof quote>>) => admitModelRun(database, consent(q), ports),
    count: async (
      table: "metering_operation" | "metering_usage_evidence" | "model_playground_payment_attempts",
    ) => Number((await sql.query<{ n: bigint }>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n),
  };
}
