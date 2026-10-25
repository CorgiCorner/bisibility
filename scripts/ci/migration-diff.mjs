import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { verifyAdditionalMigrationConstraints } from "./migration-diff-extension.mjs";

export function assertMigrationDiff(result, expectedScript) {
  if (result.error || result.signal || ![0, 2].includes(result.status)) {
    throw new Error("Schema drift inspection failed before a complete SQL result was available.");
  }
  const expected = expectedScript || "-- This is an empty migration.";
  if (result.status !== (expectedScript ? 2 : 0) || result.stdout?.trim() !== expected) {
    throw new Error("Schema drift differs from the independently verified migration contract.");
  }
}

/** Prisma omits partial indexes during introspection; validate the actual SQL authority. */
export async function verifyProviderIncidentIndex(client, schema) {
  const { rows } = await client.query(`
    SELECT idx.relname AS name, i.indisunique AS "unique", i.indisvalid AS valid,
      i.indisready AS ready, am.amname AS method, i.indnkeyatts::int AS "keyCount",
      i.indnatts::int AS "attributeCount", i.indexprs IS NOT NULL AS "hasExpressions",
      pg_get_expr(i.indpred, i.indrelid) AS predicate,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(id, ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.id
        ORDER BY k.ord) AS columns
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
    JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_catalog.pg_am am ON am.oid=idx.relam
    WHERE ns.nspname=$1 AND t.relname='provider_incidents' AND idx.relname IN
      ('provider_incidents_project_cause_current', 'provider_incidents_project_cause')
  `, [schema]);
  const expected = {
    name: "provider_incidents_project_cause_current", unique: true, valid: true, ready: true,
    columns: ["projectId", "cause"], predicate: '("retiredAt" IS NULL)', method: "btree",
    keyCount: 2, attributeCount: 2, hasExpressions: false,
  };
  if (!isDeepStrictEqual(rows, [expected]))
    throw new Error("SQL-owned provider incident index does not match its migration contract.");
}

export async function verifyMigrationDiff(env, {
  createClient = (connectionString) => new pg.Client({ connectionString }),
  verifyAdditional = verifyAdditionalMigrationConstraints,
  verifyIncidentIndex = verifyProviderIncidentIndex,
  capture = spawnSync,
} = {}) {
  const schema = new URL(env.DIRECT_URL).searchParams.get("schema") || "public";
  const client = createClient(env.DIRECT_URL);
  let expectedScript;
  try {
    await client.connect();
    // Validate SQL-owned objects even when introspection would report no drift.
    expectedScript = await verifyAdditional(client, schema);
    await verifyIncidentIndex(client, schema);
  } finally {
    await client.end();
  }
  const result = capture("npx", [
    "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "./prisma/schema",
    "--script", "--exit-code",
  ], { env: { ...process.env, ...env }, encoding: "utf8" });
  assertMigrationDiff(result, expectedScript);
  console.log("Schema drift matches the independently verified migration contract.");
}
