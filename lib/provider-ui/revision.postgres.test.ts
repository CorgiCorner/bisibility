import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const authorityMigration = () =>
  readFileSync(
    new URL(
      "../../prisma/migrations/20261011000000_provider_ui_authority/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
beforeAll(async () => {
  await db.exec(`CREATE TABLE projects (id text PRIMARY KEY,"ownerId" text,"writeMode" text,"isSample" boolean,"budgetCapCents" int,"providerAllocationsInitializedAt" timestamp);
    CREATE TABLE provider_connections (id text PRIMARY KEY,provider text,status text,priority int,enabled boolean,"credentialsEncrypted" text,"credentialSource" text,"costPerCheckCents" numeric,"allocationUnit" text,"allocationAmountPerMonth" int,"programmaticAllocationAmountPerMonth" int,"creditsAllocationAmountPerMonth" int,"creditsProgrammaticAllocationAmountPerMonth" int,"publicId" text,"projectId" text,"lastUsedAt" timestamp);
    CREATE TABLE provider_connection_rates (id text PRIMARY KEY,"connectionId" text,feature text,"amountCents" numeric);
    INSERT INTO projects VALUES ('p','owner','active',false,100,null);
    INSERT INTO provider_connections (id,provider,status,priority,enabled,"credentialSource","publicId","projectId") VALUES ('c','dataforseo','connected',100,true,'own','public','p');`);
  await db.exec(
    readFileSync(
      new URL(
        "../../prisma/migrations/20261007010000_provider_ui_commands/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(authorityMigration());
});
afterAll(() => db.close());
const revision = async () =>
  (
    await db.query<{ revision: string }>(
      `SELECT "providerUiRevision"::text AS revision FROM provider_connections WHERE id='c'`,
    )
  ).rows[0].revision;
describe("provider management revision migration", () => {
  it("initializes one stable authority before the first provider read", async () => {
    const authority = await db.query<{ id: string; instanceId: string }>(
      `SELECT id, "instanceId" FROM provider_ui_authority`,
    );
    expect(authority.rows).toEqual([
      { id: "provider-ui", instanceId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
    await db.exec(authorityMigration());
    expect((await db.query(`SELECT id, "instanceId" FROM provider_ui_authority`)).rows).toEqual(
      authority.rows,
    );
  });
  it("initializes an older empty authority table and preserves an existing instance", async () => {
    const older = new PGlite();
    try {
      await older.exec(
        `CREATE TABLE provider_ui_authority (id text PRIMARY KEY, "instanceId" text NOT NULL UNIQUE)`,
      );
      await older.exec(authorityMigration());
      const initial = await older.query(`SELECT id, "instanceId" FROM provider_ui_authority`);
      expect(initial.rows).toHaveLength(1);
      await older.exec(
        `UPDATE provider_ui_authority SET "instanceId"='retained-instance' WHERE id='provider-ui'`,
      );
      await older.exec(authorityMigration());
      expect(
        (await older.query(`SELECT id, "instanceId" FROM provider_ui_authority`)).rows,
      ).toEqual([{ id: "provider-ui", instanceId: "retained-instance" }]);
    } finally {
      await older.close();
    }
  });
  it("detects legacy ABA edits while traffic timestamps do not revoke CAS", async () => {
    const before = await revision();
    await db.exec(
      `UPDATE provider_connections SET enabled=false WHERE id='c'; UPDATE provider_connections SET enabled=true WHERE id='c'`,
    );
    expect(BigInt(await revision()) - BigInt(before)).toBe(2n);
    const stable = await revision();
    await db.exec(`UPDATE provider_connections SET "lastUsedAt"=CURRENT_TIMESTAMP WHERE id='c'`);
    expect(await revision()).toBe(stable);
  });
  it("rate child insert/update/delete advances parent, including identical-price edits", async () => {
    const before = await revision();
    await db.exec(
      `INSERT INTO provider_connection_rates VALUES ('rate','c','rank_check',0.0001); UPDATE provider_connection_rates SET "amountCents"=0.0001 WHERE id='rate'; DELETE FROM provider_connection_rates WHERE id='rate'`,
    );
    expect(BigInt(await revision()) - BigInt(before)).toBe(3n);
  });
  it("project cap/owner/write-mode changes advance project and command journal is immutable", async () => {
    await db.exec(
      `UPDATE projects SET "ownerId"='new-owner',"writeMode"='migration_hold' WHERE id='p'; INSERT INTO provider_ui_commands (scope,principal,"commandId","bodyHash",result) VALUES ('scope','owner','nonce','hash','{"outcome":"success"}')`,
    );
    expect(
      (
        await db.query<{ revision: string }>(
          `SELECT "providerUiRevision"::text AS revision FROM projects`,
        )
      ).rows[0].revision,
    ).toBe("1");
    await expect(db.exec(`UPDATE provider_ui_commands SET result='{}'`)).rejects.toThrow(
      "immutable",
    );
    await expect(db.exec(`DELETE FROM provider_ui_commands`)).rejects.toThrow("immutable");
  });
});
