import { PGlite } from "@electric-sql/pglite";

type Row = Record<string, unknown>;
type WhereClause = Row & { OR?: Row[] };
type UpdateArgs = { data: Row; where: WhereClause };

const POSTGRES_TIMESTAMP_OID = 1114;

function formatPrismaTimestamp(date: Date) {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const milliseconds = date.getUTCMilliseconds();
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${
    milliseconds ? `.${pad(milliseconds, 3)}` : ""
  }`;
}

function parsePrismaTimestamp(value: string) {
  return new Date(`${value.replace(" ", "T")}+00:00`);
}

/** The audit writer rejects anything but a strict 24-character public-ID suffix. */
export function publicId(prefix: string, seed: string) {
  return `${prefix}_${seed.padEnd(24, "x")}`;
}

export const RUN_PUBLIC_ID = publicId("rcr", "run");

/**
 * The claim reads keywords and project markets, so this fixture contains every table it touches.
 * Its timestamp columns mirror the production migration rather than accepting timestamptz values.
 */
const SCHEMA = `
  CREATE TABLE projects (id text PRIMARY KEY, domain text);
  CREATE TABLE project_markets (
    id text PRIMARY KEY, "projectId" text, "locationId" text, status text
  );
  CREATE TABLE keywords (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "locationId" text,
    device text, "archivedAt" timestamp(3)
  );
  CREATE TABLE rank_check_runs (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "requestedCount" int,
    "selectionKind" text, trigger text, status text, "startedAt" timestamp(3),
    "finishedAt" timestamp(3), outcome text, "costCents" int DEFAULT 0,
    "cancelledCount" int DEFAULT 0, "completedCount" int DEFAULT 0,
    "deferredCount" int DEFAULT 0, "failedCount" int DEFAULT 0,
    "keywordCount" int DEFAULT 0, "skippedCount" int DEFAULT 0,
    "targetCount" int DEFAULT 0, "totalCount" int DEFAULT 0
  );
  CREATE TABLE rank_check_run_items (
    id text PRIMARY KEY, "runId" text, "keywordId" text, status text,
    "actualCostCents" int, "blockedReason" text, "claimAttempts" int DEFAULT 0,
    "claimExpiresAt" timestamp(3), "finishedAt" timestamp(3), "notBefore" timestamp(3),
    "rankCheckId" text, "startedAt" timestamp(3), "updatedAt" timestamp(3)
  );
`;

function assignments(data: Row, values: unknown[]) {
  return Object.entries(data)
    .map(([column, value]) => {
      if (value && typeof value === "object" && "increment" in value) {
        const step = (value as { increment: number }).increment;
        return `"${column}" = COALESCE("${column}", 0) + $${values.push(step)}`;
      }
      return `"${column}" = $${values.push(value)}`;
    })
    .join(", ");
}

function conditions(where: WhereClause, values: unknown[]): string {
  const parts = Object.entries(where).map(([column, value]) => {
    if (column === "OR") {
      const alternatives = (value as Row[]).map((clause) => `(${conditions(clause, values)})`);
      return `(${alternatives.join(" OR ")})`;
    }
    return value === null ? `"${column}" IS NULL` : `"${column}" = $${values.push(value)}`;
  });
  return parts.length === 0 ? "TRUE" : parts.join(" AND ");
}

/** A Prisma-shaped client backed by a transaction-capable PostgreSQL-compatible engine. */
export async function createClaimFixture() {
  const db = new PGlite({
    parsers: { [POSTGRES_TIMESTAMP_OID]: parsePrismaTimestamp },
    serializers: { [POSTGRES_TIMESTAMP_OID]: formatPrismaTimestamp },
  });
  await db.exec("SET TIME ZONE 'UTC';");
  await db.exec(SCHEMA);
  const audits: Row[] = [];
  const query = async (text: string, values: unknown[] = []) =>
    (await db.query(text, values)).rows as Row[];
  const updateMany = async (table: string, { data, where }: UpdateArgs) => {
    const values: unknown[] = [];
    const set = assignments(data, values);
    const filter = conditions(where, values);
    const updated = await query(
      `UPDATE "${table}" SET ${set} WHERE ${filter} RETURNING id`,
      values,
    );
    return { count: updated.length };
  };
  const tx = {
    $queryRaw: async (sql: { text: string; values: unknown[] }) => query(sql.text, sql.values),
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        audits.push(data);
        return data;
      },
    },
    rankCheckRun: {
      update: (args: UpdateArgs) => updateMany("rank_check_runs", args),
      updateMany: (args: UpdateArgs) => updateMany("rank_check_runs", args),
    },
    rankCheckRunItem: {
      groupBy: async ({ where }: { where: { runId: string } }) => {
        const rows = await query(
          `SELECT "keywordId", status, COUNT(*)::int AS count,
             COALESCE(SUM("actualCostCents"), 0)::int AS cost
           FROM "rank_check_run_items" WHERE "runId" = $1 GROUP BY "keywordId", status`,
          [where.runId],
        );
        return rows.map((row) => ({
          _count: { _all: row.count },
          _sum: { actualCostCents: row.cost },
          keywordId: row.keywordId,
          status: row.status,
        }));
      },
      updateMany: (args: UpdateArgs) => updateMany("rank_check_run_items", args),
    },
  };
  const database = {
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
      await db.exec("BEGIN");
      try {
        const result = await callback(tx);
        await db.exec("COMMIT");
        return result;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { audits, database, db, query };
}
