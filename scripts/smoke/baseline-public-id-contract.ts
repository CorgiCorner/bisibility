import assert from "node:assert/strict";
import { PUBLIC_ID_RESOURCE_REGISTRY, type PublicIdPrefix } from "@/lib/db/public-id-resources";
import type pg from "pg";

const publicIdTables = {
  biz: "business_locations",
  lmr: "local_measurement_runs",
  lmj: "local_monitor_launch_intents",
  lmn: "local_monitors",
  lmt: "local_measurement_targets",
  agr: "agent_reports",
  ait: "ai_topics",
  aip: "ai_prompts",
  apr: "ai_prompt_revisions",
  ais: "ai_tracking_schedules",
  air: "ai_tracking_runs",
  asm: "ai_tracking_samples",
  asg: "ai_tracking_suggestion_generations",
  al: "triggered_alerts",
  alr: "alert_rules",
  audit: "audit_logs",
  check: "rank_checks",
  cmp: "competitors",
  conn: "provider_connections",
  dwh: "ingest_hooks",
  ferry: "migration_tokens",
  imp: "cloud_import_jobs",
  inv: "invites",
  key: "api_keys",
  kw: "keywords",
  mbr: "memberships",
  ntf: "notifications",
  pat: "personal_access_tokens",
  pmkt: "project_markets",
  prj: "projects",
  rcr: "rank_check_runs",
  sch: "check_schedules",
  sid: "sessions",
  sig: "signals",
  svkw: "saved_keywords",
  tag: "tags",
  usr: "users",
  viw: "saved_views",
  we: "webhook_endpoints",
} as const satisfies Record<PublicIdPrefix, string>;

const constraintName = (table: string) => `${table}_public_id_contract_format`;

export async function assertBaselinePublicIdCatalog(db: Pick<pg.Client, "query">, expectedSchema: string) {
  assert.deepEqual(Object.keys(publicIdTables).sort(), Object.keys(PUBLIC_ID_RESOURCE_REGISTRY).sort());
  const expectedTables = Object.values(publicIdTables);
  const current = await db.query<{ schema: string }>("SELECT current_schema() AS schema");
  const schema = current.rows[0]?.schema;
  assert.equal(schema, expectedSchema, "The baseline catalog must use its owned database schema.");
  const columns = await db.query<{ isNullable: string; table: string }>(
    `SELECT table_name AS "table", is_nullable AS "isNullable"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'publicId'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [expectedTables],
  );
  assert.deepEqual(columns.rows.map((row) => row.table).sort(), [...expectedTables].sort());
  for (const row of columns.rows) assert.equal(row.isNullable, "NO", row.table);
  const constraintNames = expectedTables.map(constraintName);
  const constraints = await db.query<{
    definition: string; name: string; table: string; schema: string; validated: boolean;
  }>(
    `SELECT constraint_meta.conname AS name, constraint_meta.convalidated AS validated,
            table_meta.relname AS "table", namespace_meta.nspname AS schema,
            pg_get_constraintdef(constraint_meta.oid, false) AS definition
       FROM pg_constraint AS constraint_meta
       JOIN pg_class AS table_meta ON table_meta.oid = constraint_meta.conrelid
       JOIN pg_namespace AS namespace_meta ON namespace_meta.oid = table_meta.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND constraint_meta.conname = ANY($1::text[])
      ORDER BY constraint_meta.conname`,
    [constraintNames],
  );
  assert.equal(constraints.rows.length, constraintNames.length);
  for (const [prefix, table] of Object.entries(publicIdTables)) {
    const constraint = constraints.rows.find((row) => row.name === constraintName(table));
    assert.equal(constraint?.schema, schema);
    assert.equal(constraint?.table, table);
    assert.equal(constraint?.validated, true);
    assert.equal(constraint?.definition, `CHECK (("publicId" ~ '^${prefix}_[a-z][a-z0-9]{23}$'::text))`);
  }
}
