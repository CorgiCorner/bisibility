import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20261011200600_provider_rate_authority/migration.sql",
  "utf8",
);
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TYPE "ProviderCostFeature" AS ENUM ('rank_check','keyword_metrics');
    CREATE TABLE provider_connections(id text PRIMARY KEY,"credentialSource" text,"costPerCheckCents" numeric(10,4),"createdAt" timestamp NOT NULL,"updatedAt" timestamp NOT NULL);
    CREATE TABLE provider_connection_rates(id text PRIMARY KEY,"connectionId" text REFERENCES provider_connections(id),feature "ProviderCostFeature","amountCents" numeric(10,4),"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("connectionId",feature));
    INSERT INTO provider_connections VALUES
      ('copy','own',1.2345,'2026-01-01','2026-01-02'),
      ('zero','own',0,'2026-01-01','2026-01-02'),
      ('absent','own',NULL,'2026-01-01','2026-01-02'),
      ('conflict','own',99,'2026-01-01','2026-01-02'),
      ('hosted','hosted',50,'2026-01-01','2026-01-02');
    INSERT INTO provider_connection_rates VALUES('existing','conflict','rank_check',0,'2026-01-03','2026-01-04');`);
  await db.exec(`ALTER TABLE provider_connections
    ADD COLUMN provider text DEFAULT 'dataforseo', ADD COLUMN status text DEFAULT 'connected',
    ADD COLUMN priority integer DEFAULT 0, ADD COLUMN enabled boolean DEFAULT true,
    ADD COLUMN "credentialsEncrypted" text, ADD COLUMN "publicId" text, ADD COLUMN "projectId" text,
    ADD COLUMN "providerUiRevision" bigint DEFAULT 0;`);
  const previous = readFileSync(
    "prisma/migrations/20261011040000_retire_accounting/migration.sql",
    "utf8",
  );
  const connectionTrigger = previous.slice(
    previous.indexOf("CREATE OR REPLACE FUNCTION provider_ui_connection_revision"),
    previous.indexOf("CREATE OR REPLACE FUNCTION provider_ui_project_revision"),
  );
  await db.exec(`${connectionTrigger}
    CREATE TRIGGER provider_ui_connection_revision BEFORE UPDATE ON provider_connections
    FOR EACH ROW EXECUTE FUNCTION provider_ui_connection_revision();`);
  const uiMigration = readFileSync(
    "prisma/migrations/20261007010000_provider_ui_commands/migration.sql",
    "utf8",
  );
  await db.exec(
    uiMigration.slice(
      uiMigration.indexOf("CREATE FUNCTION provider_ui_rate_revision"),
      uiMigration.indexOf("CREATE FUNCTION provider_ui_command_retained"),
    ),
  );
  return db;
}

test("preserves exact manual values, genuine zero and existing authoritative overrides", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const rows = await db.query<{ connection: string; amount: string }>(
      `SELECT "connectionId" AS connection,"amountCents"::text AS amount FROM provider_connection_rates ORDER BY "connectionId"`,
    );
    expect(rows.rows).toEqual([
      { connection: "conflict", amount: "0.0000" },
      { connection: "copy", amount: "1.2345" },
      { connection: "zero", amount: "0.0000" },
    ]);
    const columns = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='provider_connections' AND column_name='costPerCheckCents'`,
    );
    expect(columns.rows).toEqual([]);
    const before = await db.query("SELECT * FROM provider_connection_rates ORDER BY id");
    await db.exec(migration);
    expect((await db.query("SELECT * FROM provider_connection_rates ORDER BY id")).rows).toEqual(
      before.rows,
    );
    await db.exec(`UPDATE provider_connections SET priority=1 WHERE id='copy'`);
    expect(
      (
        await db.query(
          `SELECT "providerUiRevision"::text AS revision FROM provider_connections WHERE id='copy'`,
        )
      ).rows,
    ).toEqual([{ revision: "2" }]);
    await db.exec(
      `UPDATE provider_connection_rates SET "amountCents"=2 WHERE "connectionId"='copy'`,
    );
    expect(
      (
        await db.query(
          `SELECT "providerUiRevision"::text AS revision FROM provider_connections WHERE id='copy'`,
        )
      ).rows,
    ).toEqual([{ revision: "3" }]);
  } finally {
    await db.close();
  }
});

test("refuses invalid legacy values before deleting any source data", async () => {
  const db = await fixture();
  try {
    await db.exec(`UPDATE provider_connections SET "costPerCheckCents"=-1 WHERE id='copy'`);
    await expect(db.exec(migration)).rejects.toThrow("Invalid legacy provider rate");
    expect(
      (
        await db.query(
          `SELECT "costPerCheckCents"::text AS amount FROM provider_connections WHERE id='copy'`,
        )
      ).rows,
    ).toEqual([{ amount: "-1.0000" }]);
    expect((await db.query("SELECT id FROM provider_connection_rates")).rows).toEqual([
      { id: "existing" },
    ]);
  } finally {
    await db.close();
  }
});
