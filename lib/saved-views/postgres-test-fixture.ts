import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export const personalViewMigration = "20261012200100_personal_project_views";

/** Always creates and drops a separate database; never mutates the supplied fixture database. */
export async function personalViewDatabase(
  beforeExpansion?: (client: pg.Client) => Promise<void>,
  onQuery?: () => void,
) {
  const adminUrl = process.env.PROVIDER_UI_TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("Owned PostgreSQL fixture URL is required.");
  const name = `personal_views_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  url.searchParams.delete("schema");
  const connectionString = url.href;
  const admin = new pg.Client({
    connectionString: adminUrl,
    ...databaseConnectionConfig(adminUrl),
  });
  const client = new pg.Client({ connectionString, ...databaseConnectionConfig(connectionString) });
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString, ...databaseConnectionConfig(connectionString) }),
    log: onQuery ? [{ emit: "event", level: "query" }] : [],
  });
  if (onQuery) db.$on("query", onQuery);
  await admin.connect();
  let created = false;
  async function close() {
    const errors: unknown[] = [];
    for (const result of await Promise.allSettled([db.$disconnect(), client.end()]))
      if (result.status === "rejected") errors.push(result.reason);
    try {
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } catch (error) {
      errors.push(error);
    }
    try {
      await admin.end();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, "Owned personal-view database cleanup failed.");
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await client.connect();
    const migrations = (await readdir("prisma/migrations"))
      .filter((entry) => /^\d{14}_/.test(entry))
      .sort();
    if (!migrations.includes(personalViewMigration))
      throw new Error("Personal-view migration is missing.");
    for (const migration of migrations) {
      if (migration === personalViewMigration) await beforeExpansion?.(client);
      await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    return { client, close, db };
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Personal-view fixture failed with a cleanup error.",
      );
    }
    throw error;
  }
}
