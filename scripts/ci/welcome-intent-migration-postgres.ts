import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

export async function verifyWelcomeIntentMigration(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  const schema = `welcome_intent_upgrade_${process.pid}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE "users" (
        "id" TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "users" ("id") VALUES ('existing_user');
    `);
    const migration = await readFile(
      new URL(
        "../../prisma/migrations/20260903210000_welcome_followup_intent/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(migration);
    const result = await client.query<{
      welcomeFollowupExpiredAt: Date | null;
      welcomeFollowupFinishedAt: Date | null;
      welcomeFollowupRequestedAt: Date | null;
      welcomeFollowupStartedAt: Date | null;
    }>(`
      SELECT
        "welcomeFollowupRequestedAt",
        "welcomeFollowupStartedAt",
        "welcomeFollowupFinishedAt",
        "welcomeFollowupExpiredAt"
      FROM "users"
      WHERE "id" = 'existing_user'
    `);
    const row = result.rows[0];
    if (!row || Object.values(row).some((value) => value !== null)) {
      throw new Error(`Welcome intent migration backfilled an existing user: ${JSON.stringify(row)}.`);
    }
    console.log("Welcome intent no-backfill migration passed: existing user remained NULL.");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}
