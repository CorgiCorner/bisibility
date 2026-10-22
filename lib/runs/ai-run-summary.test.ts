import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let db: PGlite;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test" }));
vi.mock("@/lib/metering/usage-sql", () => ({
  canonicalUsageSql: () => Prisma.sql`SELECT * FROM fixture_usage`,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (sql: Prisma.Sql) => db.query(sql.text, sql.values).then((result) => result.rows),
  },
}));

import { aiRunSummaries } from "./ai-run-summary";

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
}, 30000);
beforeEach(async () => {
  await db.exec("DROP TABLE IF EXISTS ai_tracking_samples, fixture_usage");
  await db.exec(`CREATE TABLE ai_tracking_samples (id text, "projectId" text, "runId" text, dispatch text, "claimedAt" timestamp, "providerTaskId" text, receipt jsonb, plan jsonb, evidence jsonb);
    CREATE TABLE fixture_usage (operation_pk text, id text, "projectId" text, "connectionId" text, "providerCredentialVersion" text, "measurementStatus" text, "costCents" numeric);
    INSERT INTO fixture_usage VALUES ('one','op','p','conn','v1','recorded',0.0123),('foreign','foreign','other','conn','v1','recorded',100),('old','old','p','conn','v0','recorded',100);
    INSERT INTO ai_tracking_samples (id,"projectId","runId",dispatch,"claimedAt","providerTaskId",receipt,plan) VALUES
      ('a','p','r','terminal','2026-10-21','task','{"operationRef":{"version":1,"namespace":"test","operationId":"op"}}','{"credentialConnectionId":"conn","credentialVersion":"v1"}'),
      ('b','p','r','terminal','2026-10-21','task','{"providerCostEntryId":"op"}','{"credentialConnectionId":"conn","credentialVersion":"v1"}'),
      ('c','p','r','collecting','2026-10-21','task','{"providerCostEntryId":"foreign"}','{"credentialConnectionId":"conn","credentialVersion":"v1"}'),
      ('d','p','r','terminal','2026-10-21','task','{"providerCostEntryId":"old"}','{"credentialConnectionId":"conn","credentialVersion":"v1"}');`);
});
afterAll(async () => {
  await db.close();
});
describe("AI summary SQL", () => {
  it("counts materialized progress, deduplicates paid operations, and scopes receipts to project and credential revision", async () => {
    const [row] = await aiRunSummaries("p", ["r"]);
    expect(row).toMatchObject({ total: 4, completed: 3, known: 2 });
    expect(Number(row.costCents)).toBe(0.0123);
  });
  it("does not disclose another project's samples", async () => {
    expect(await aiRunSummaries("other", ["r"])).toEqual([]);
  });
  it("treats explicit no-dispatch zero as confirmed, while an unresolved receipt stays unknown", async () => {
    await db.exec(`INSERT INTO ai_tracking_samples (id,"projectId","runId",dispatch,"claimedAt","providerTaskId",receipt,plan) VALUES
      ('zero','p','zero_run','terminal',null,null,'{"noDispatch":true,"state":"confirmed","amountUsd":"0"}','{}'),
      ('unknown','p','unknown_run','collecting',null,'task','{"state":"unknown","amountUsd":null}','{}');`);
    const rows = await aiRunSummaries("p", ["zero_run", "unknown_run"]);
    expect(rows.find((row) => row.runId === "zero_run")).toMatchObject({
      total: 1,
      known: 1,
      costCents: "0",
    });
    expect(rows.find((row) => row.runId === "unknown_run")).toMatchObject({
      total: 1,
      known: 0,
      costCents: null,
    });
  });
  it("does not choose an arbitrary charge when a legacy operation reference is ambiguous", async () => {
    await db.exec(
      `INSERT INTO fixture_usage VALUES ('ambiguous','legacy:op','p','conn','v1','recorded',999);`,
    );
    const [row] = await aiRunSummaries("p", ["r"]);
    expect(row.known).toBe(0);
    expect(row.costCents).toBeNull();
    expect(row.total).toBe(4);
  });
});
