import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

export async function verifySavedKeywordMarketMigration(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  const schema = `saved_keyword_upgrade_${process.pid}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE "locations" (
        "canonicalKey" TEXT PRIMARY KEY,
        "countryCode" TEXT NOT NULL,
        "languageCode" TEXT NOT NULL
      );
      CREATE TABLE "saved_keywords" (
        "id" TEXT PRIMARY KEY,
        "location" TEXT NOT NULL,
        "normalizedText" TEXT NOT NULL DEFAULT 'legacy',
        "projectId" TEXT NOT NULL DEFAULT 'project_1'
      );
      CREATE UNIQUE INDEX "saved_keywords_projectId_normalizedText_location_key"
      ON "saved_keywords"("projectId", "normalizedText", "location");
      INSERT INTO "locations" ("canonicalKey", "countryCode", "languageCode")
      VALUES ('ES', 'ES', 'es');
      INSERT INTO "saved_keywords" ("id", "location", "normalizedText") VALUES
        ('exact', 'ES', 'exact'),
        ('qualified-city', 'ES/Andalusia/Malaga@en', 'qualified-city'),
        ('known-default-city', 'PL/Legacy/Warsaw', 'known-default-city'),
        ('unsupported-legacy', 'ZZ/Legacy/Nowhere', 'unsupported-legacy');
    `);
    const migration = await readFile(
      new URL(
        "../../prisma/migrations/20260814021500_saved_keyword_market_pair/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(migration);
    const result = await client.query<{
      countryCode: string;
      id: string;
      languageCode: string;
    }>(
      `SELECT "id", "countryCode", "languageCode" FROM "saved_keywords" ORDER BY "id"`,
    );
    const actual = Object.fromEntries(
      result.rows.map((row) => [row.id, [row.countryCode, row.languageCode]]),
    );
    const expected = {
      exact: ["ES", "es"],
      "known-default-city": ["PL", "pl"],
      "qualified-city": ["ES", "en"],
      "unsupported-legacy": ["ZZ", "und"],
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Saved keyword migration produced ${JSON.stringify(actual)}.`);
    }
    console.log("Saved keyword legacy market migration passed.");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}
