import { readFileSync } from "node:fs";
import pg from "pg";
import { expect, test } from "vitest";
import { fixture } from "./store/test-fixture";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261011020000_accounting_history_snapshot/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
test("snapshot requires quiescence, retains explicit nonsecret fields and freezes sources", async () => {
  const f = await fixture();
  const db = new pg.Client({ connectionString: f.url });
  await db.connect();
  try {
    await db.query(`SET search_path TO "${f.schema}"`);
    await db.query(`DROP TABLE metering_history_reference, metering_history_import, metering_history_progress,
      metering_legacy_usage_source, metering_legacy_setting_source, metering_legacy_reference_source,
      metering_legacy_proof_source CASCADE; DROP FUNCTION metering_history_source_immutable() CASCADE;
      CREATE TABLE provider_cost_entries(id text, "projectId" text, "connectionId" text, provider text, feature text,
        source text, trigger text, tag text, "keywordId" text, "correlationId" text, "providerRequestId" text,
        "credentialKind" text, "credentialId" text, "costCents" numeric, "unitCostCents" numeric,
        "priceCents" numeric, "usageQuantity" numeric, "measurementStatus" text, "credentialSource" text,
        cached boolean, failed boolean, "createdAt" timestamp);
      INSERT INTO provider_cost_entries VALUES('legacy','project','connection',null,'ranked_keywords',null,null,null,null,null,null,null,null,1.2345,0.6172,null,2,'recorded','own',false,false,'2026-09-01');
      CREATE TABLE projects(id text,"budgetCapCents" int,"providerAllocationsInitializedAt" timestamptz,"ownerId" text);
      INSERT INTO projects VALUES('project',2,now(),'current-owner');
      CREATE TABLE provider_connections(id text,"projectId" text,provider text,"allocationUnit" text,"allocationAmountPerMonth" int,"programmaticAllocationAmountPerMonth" int,"creditsAllocationAmountPerMonth" int,"creditsProgrammaticAllocationAmountPerMonth" int,"costPerCheckCents" numeric,"credentialsEncrypted" text);
      INSERT INTO provider_connections VALUES('connection','project','dataforseo','cents',2,null,3,0,0.3,'secret-envelope');
      CREATE TABLE provider_connection_rates(id text,"connectionId" text,feature text,"amountCents" numeric);
      INSERT INTO provider_connection_rates VALUES('rate','connection','rank_check',0.7)`);
    await db.query("BEGIN");
    await expect(db.query(migration)).rejects.toThrow("quiesced");
    await db.query("ROLLBACK");
    await db.query("SET bisibility.accounting_quiesced = 'on'");
    await db.query(migration);
    const snapshot = await db.query(
      "SELECT payload FROM metering_legacy_setting_source ORDER BY kind",
    );
    expect(JSON.stringify(snapshot.rows)).not.toContain("secret-envelope");
    expect(JSON.stringify(snapshot.rows)).not.toContain("current-owner");
    expect(snapshot.rows).toContainEqual({
      payload: {
        id: "rate",
        connectionId: "connection",
        feature: "rank_check",
        amountCents: "0.7",
      },
    });
    await expect(db.query("UPDATE metering_legacy_usage_source SET payload='{}'")).rejects.toThrow(
      "immutable",
    );
    await expect(db.query("DELETE FROM metering_legacy_setting_source")).rejects.toThrow(
      "immutable",
    );
  } finally {
    await db.end();
    await f.close();
  }
});
