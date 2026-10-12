import type { PGlite } from "@electric-sql/pglite";

/** Minimal physical Store records for SQL projection tests, without a second ledger. */
export async function createUsageTables(db: PGlite) {
  await db.exec(`CREATE TABLE metering_operation(operation_pk text PRIMARY KEY, namespace text,principal text,operation_id text,input jsonb,state text,created_at timestamptz);
    CREATE TABLE metering_receipt(receipt_pk text PRIMARY KEY,operation_pk text,receipt_id text,sequence int,body jsonb,occurred_at timestamptz,cost_certainty text,cost_units bigint);
    CREATE TABLE metering_measurement(receipt_pk text,unit text,value numeric,scale int,certainty text);
    CREATE TABLE metering_paid_attempt_context(namespace text,operation_id text,principal text,context jsonb,fenced_at timestamptz,debit_id text);`);
}
export async function seedTestUsage(
  db: PGlite,
  input: {
    id?: string;
    projectId?: string;
    connectionId?: string;
    provider?: string;
    feature?: string;
    correlationId?: string;
    costCents?: number | null;
    usageQuantity?: number | null;
    measurementStatus?: string;
    cached?: boolean;
    failed?: boolean;
    createdAt?: string;
    keywordId?: string | null;
    rankCheckId?: string;
    budgetCents?: number;
  },
) {
  const id = input.id ?? crypto.randomUUID(),
    known = input.measurementStatus !== "unknown";
  const at = input.createdAt ?? new Date().toISOString();
  await db.query(`INSERT INTO metering_operation VALUES($1,'default','owner',$1,$2,'settled',$3)`, [
    id,
    JSON.stringify({
      scope: {
        namespace: "default",
        principal: "owner",
        group: input.projectId ?? "project_1",
        connection: input.connectionId ?? "connection",
      },
      provider: input.provider ?? "serpapi",
      operation: input.feature ?? "rank_check",
      fundingSource: "byok",
      source: "app",
      surface: "app",
      correlationId: input.correlationId,
    }),
    at,
  ]);
  await db.query(`INSERT INTO metering_receipt VALUES($1,$1,$1,0,$2,$3,$4,$5)`, [
    id,
    JSON.stringify({
      cached: input.cached ?? false,
      failed: input.failed ?? false,
      metadata: {},
    }),
    at,
    known ? "measured" : "unknown",
    known ? Math.round((input.costCents ?? 0) * 10000) : null,
  ]);
  await db.query(
    `INSERT INTO metering_paid_attempt_context VALUES('default',$1,'owner',$2,NULL,NULL)`,
    [id, JSON.stringify({ keywordId: input.keywordId, rankCheckId: input.rankCheckId })],
  );
  await db.query(`INSERT INTO metering_measurement VALUES($1,'budget_cents',$2,4,$3)`, [
    id,
    known ? Math.round((input.budgetCents ?? input.costCents ?? 0) * 10000) : null,
    known ? "measured" : "unknown",
  ]);
  await db.query(`INSERT INTO metering_measurement VALUES($1,'units',$2,6,$3)`, [
    id,
    known && input.usageQuantity != null ? Math.round(input.usageQuantity * 1000000) : null,
    known && input.usageQuantity != null ? "measured" : "unknown",
  ]);
}
