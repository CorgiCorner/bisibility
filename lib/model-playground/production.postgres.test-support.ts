import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";

async function applyMigration(admin: Client, script: string) {
  await admin.query("BEGIN");
  try {
    await admin.query(script);
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Production-model DDL plus playground migrations; other SQL triggers/generated columns are not reproduced. */
export async function reportProductionDatabase() {
  const connectionString = process.env.AI_TRACKING_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Disposable local PostgreSQL URL required");
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_fixture"))
    throw new Error("Only a local fixture database is allowed");
  const schema = `mp_report_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set("schema", schema);
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString, options: `-c search_path="${schema}"` }, { schema }),
  });
  const dispose = async () => {
    await client.$disconnect();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  };
  try {
    const pushed = spawnSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema",
        "prisma/schema",
        "--script",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url.href,
          DIRECT_URL: url.href,
          DOTENV_CONFIG_PATH: "/dev/null",
        },
        encoding: "utf8",
      },
    );
    if (pushed.status !== 0) throw new Error(pushed.stderr);
    await admin.query(`SET search_path TO "${schema}"`);
    // Prisma cannot recreate this unrelated SQL-owned generated keyword column as a DEFAULT.
    // Its value is unused here; preserve the real prompt/schedule/run/metering tables verbatim.
    const ddl = pushed.stdout
      .replace(/-- CreateSchema\s+CREATE SCHEMA IF NOT EXISTS "public";/, "")
      .replace(/"textNormalized" TEXT DEFAULT lower\([\s\S]*?\)\),/, '"textNormalized" TEXT,');
    await admin.query(ddl);
    for (const name of [
      "20261111195343_model_playground_integrity",
      "20261111200000_model_playground_result_extensions",
      "20261112210000_model_playground_attempt_provenance",
      "20261112220000_model_playground_routing_settings",
      "20261113200000_model_playground_report_delete",
      "20261113210000_model_playground_report_recovery",
      "20261113220000_model_playground_report_refresh",
      "20261113225000_model_playground_dispatch_finite",
    ])
      await applyMigration(
        admin,
        await readFile(
          new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    return { client, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
