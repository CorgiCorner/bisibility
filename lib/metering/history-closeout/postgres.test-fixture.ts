import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { makePublicId } from "@/lib/db/public-id";
import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { createPostgresStore } from "@/lib/metering/store";
import { saveBudget } from "@/lib/metering/store/budgets";
import { key } from "@/lib/metering/store/codec";
import { testDatabaseUrl } from "@/lib/metering/store/test-fixture";
import { accountingHistoryMigration } from "@/scripts/data-migrations/20261011021000_accounting_history";
import { runActiveDataMigrations } from "@/scripts/data-migrations/runner";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Budget } from "@usagekit/core";
import pg from "pg";
import { type CloseoutManifest, closeoutPolicy, historyMigration } from "./manifest";
import { applyCloseout, previewCloseout } from "./service";

export async function closeoutPostgresFixture() {
  const adminUrl = testDatabaseUrl();
  if (!["127.0.0.1", "localhost"].includes(new URL(adminUrl).hostname))
    throw new Error("Closeout proof requires owned loopback PostgreSQL.");
  const admin = new pg.Client({ connectionString: adminUrl });
  const database = `closeout_${randomUUID().replaceAll("-", "")}_fixture`;
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: url.href });
  let statements = 0;
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href, max: 8 }),
    log: [{ level: "query", emit: "event" }],
  });
  db.$on("query", () => {
    statements++;
  });
  const namespace = process.env.METERING_NAMESPACE ?? "default";
  const operator = makePublicId("usr");
  const projects = new Map<string, string>();
  const cohorts = [
    "normal",
    "rollback",
    "race",
    "stale",
    "native",
    "alerts",
    "sealed",
    "shared",
    "restart",
    "schema",
    "forged",
    "bulk",
  ];
  const definition: Budget = {
    id: "attempts",
    version: 1,
    scope: { kind: "group", namespace, group: "normal" },
    surface: "any",
    unit: "paid_attempts",
    limit: null,
    onExceed: "block",
    window: { kind: "calendar_month", timezone: "UTC" },
  };
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await client.connect();
    await client.query("SET TIME ZONE 'UTC'");
    const migrations = readdirSync("prisma/migrations")
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    for (const migration of migrations) {
      if (migration === "20261011020000_accounting_history_snapshot") {
        await client.query(
          `INSERT INTO users(id,"publicId",name,email,"emailVerified","isInstanceAdmin","updatedAt") VALUES('closeout-owner',$1,'Fixture operator','closeout@example.test',true,true,now())`,
          [operator],
        );
        for (const name of cohorts) {
          const publicId = makePublicId("prj");
          projects.set(name, publicId);
          await client.query(
            `INSERT INTO projects(id,"publicId",name,domain,"ownerId","updatedAt","budgetCapCents") VALUES($1,$2,$1,'example.test','closeout-owner',now(),100)`,
            [name, publicId],
          );
          for (const suffix of name === "bulk"
            ? Array.from({ length: 77 }, (_, index) => String(index).padStart(3, "0"))
            : name === "shared"
              ? ["a", "b"]
              : ["a"]) {
            await client.query(
              `INSERT INTO provider_cost_entries(id,"projectId","connectionId","costCents","usageQuantity",provider,source,"createdAt") VALUES($1,$2,$3,1.2345,NULL,NULL,'app','2026-07-22T12:00:00Z')`,
              [`${name}-${suffix}`, name, `retired-${name}`],
            );
          }
        }
        await client.query("SET bisibility.accounting_quiesced='on'");
      }
      if (migration === "20261011050000_drop_project_spending_cap") {
        const sql = {
          async query<T>(query: Prisma.Sql): Promise<T[]> {
            return (await client.query(query.text, query.values)).rows as T[];
          },
          async execute(query: Prisma.Sql) {
            return (await client.query(query.text, query.values)).rowCount ?? 0;
          },
        };
        await client.query("BEGIN");
        await saveBudget(sql, definition);
        await client.query("COMMIT");
        const metadata = dataMigrationManifest.find((m) => m.id === historyMigration)!;
        await runActiveDataMigrations(client, [{ ...metadata, ...accountingHistoryMigration }], {
          batchSize: 100,
          log: () => {},
        });
      }
      await client.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    await createPostgresStore({ prisma: db, clock: { now: () => new Date() } });
    const manifest = async (cohort: string, suffixes = ["a"]): Promise<CloseoutManifest> => {
      const operations = [];
      for (const suffix of suffixes) {
        const id = `legacy:${cohort}-${suffix}`;
        const receipt = await client.query(
          "SELECT receipt_id FROM metering_receipt WHERE operation_pk=$1 ORDER BY sequence LIMIT 1",
          [key(namespace, id)],
        );
        operations.push({
          operationId: id,
          expectedVersion: 1,
          receiptId: String(receipt.rows[0].receipt_id),
        });
      }
      return {
        policy: closeoutPolicy,
        namespace,
        projectPublicId: projects.get(cohort)!,
        connection: `retired-${cohort}`,
        operator,
        reason: "Retained original identity and native units irrecoverable",
        evidenceRef: "operator-case:owned-source-search",
        recordedAt: new Date().toISOString(),
        operations,
      };
    };
    const preview = (value: CloseoutManifest) =>
      db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return previewCloseout(tx, value);
        },
        { isolationLevel: "RepeatableRead", timeout: 30000 },
      );
    const apply = (value: CloseoutManifest, digest: string | null, timeout = 30000) => {
      if (!digest) throw new Error("An approvable preview digest is required.");
      return db.$transaction((tx) => applyCloseout(tx, value, digest), {
        isolationLevel: "ReadCommitted",
        timeout,
      });
    };
    const close = async () => {
      await db.$disconnect();
      await client.end();
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.end();
    };
    return {
      url: url.href,
      db,
      client,
      namespace,
      manifest,
      preview,
      apply,
      close,
      definition,
      migrationCount: migrations.length,
      statements: () => statements,
    };
  } catch (error) {
    await db.$disconnect();
    await client.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
    await admin.end();
    throw error;
  }
}
