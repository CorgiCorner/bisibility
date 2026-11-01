import type { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { readInstanceRecoveryAccounting } from "./instance-recovery-accounting";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "default" }));
const db = new PGlite();
const tx = {
  $queryRaw: async (sql: { text: string; values: unknown[] }) =>
    (await db.query(sql.text, sql.values)).rows,
} as unknown as Pick<Prisma.TransactionClient, "$queryRaw">;

beforeEach(async () => {
  await db.exec(`DROP TABLE IF EXISTS metering_history_closeout, metering_unknown_closeout,
    metering_paid_attempt_context, metering_receipt, metering_operation;
    CREATE TABLE metering_operation(operation_pk text PRIMARY KEY,namespace text,
      operation_id text,principal text,state text,version int,input jsonb);
    CREATE TABLE metering_receipt(operation_pk text,receipt_id text,sequence int,
      body jsonb,cost_units bigint,cost_certainty text);
    CREATE TABLE metering_history_closeout(operation_pk text,namespace text,operation_id text,
      version int,receipt_id text,disposition text);
    CREATE TABLE metering_unknown_closeout(operation_pk text,namespace text,operation_id text,
      version int,input jsonb,policy text,attempt_id text,credential_version text);
    CREATE TABLE metering_paid_attempt_context(namespace text,operation_id text,
      principal text,dispatch_lease_id text,fenced_at timestamptz,context jsonb);`);
});
afterAll(() => db.close());

async function historical(id: string, units: string, namespace = "default") {
  await db.query("INSERT INTO metering_operation VALUES($1,$2,$1,'owner','settled',2,'{}')", [
    id,
    namespace,
  ]);
  await db.query(
    "INSERT INTO metering_receipt VALUES($1,'original',0,'{}',$2,'measured'),($1,'correction',1,'{}',$2,'measured')",
    [id, units],
  );
  await db.query(
    "INSERT INTO metering_history_closeout VALUES($1,$2,$1,2,'correction','financially_closed_identity_incomplete')",
    [id, namespace],
  );
}

async function closedUnknown(id: string) {
  const input = JSON.stringify({ fundingSource: "byok", provider: "dataforseo" });
  await db.query(
    "INSERT INTO metering_operation VALUES($1,'default',$1,'owner','dispatch_intended',2,$2)",
    [id, input],
  );
  await db.query(
    "INSERT INTO metering_unknown_closeout VALUES($1,'default',$1,2,$2,'native-byok-cost-unknown-v1','attempt','credential-v1')",
    [id, input],
  );
  await db.query(
    "INSERT INTO metering_paid_attempt_context VALUES('default',$1,'owner','attempt',now(),$2)",
    [id, JSON.stringify({ providerCredentialVersion: "credential-v1" })],
  );
}

test("retains costs without a business-record join or month cutoff and counts each correction once", async () => {
  await historical("deleted-project", "12840");
  await historical("old-provider-identity", "15500");
  await historical("other-instance", "100000000", "other");
  await closedUnknown("closed");
  expect(await readInstanceRecoveryAccounting(tx, "default")).toEqual({
    historicalCount: 2,
    historicalCostUsdUnits: "28340",
    closedUnknownCount: 1,
  });
});

test("uses the final receipt and the original binding for unknown closures", async () => {
  await historical("superseded", "1000000");
  await db.query(
    "INSERT INTO metering_receipt VALUES('superseded','later',2,'{}',2000000,'measured')",
  );
  await closedUnknown("changed-version");
  await db.query("UPDATE metering_operation SET version=3 WHERE operation_id='changed-version'");
  await closedUnknown("changed-fence");
  await db.query(
    "UPDATE metering_paid_attempt_context SET dispatch_lease_id='different' WHERE operation_id='changed-fence'",
  );
  await closedUnknown("closed");
  expect(await readInstanceRecoveryAccounting(tx, "default")).toEqual({
    historicalCount: 0,
    historicalCostUsdUnits: "0",
    closedUnknownCount: 1,
  });
});

test("preserves exact monetary units above JavaScript's safe integer range", async () => {
  await historical("large", "9007199254740993");
  expect((await readInstanceRecoveryAccounting(tx, "default")).historicalCostUsdUnits).toBe(
    "9007199254740993",
  );
});
