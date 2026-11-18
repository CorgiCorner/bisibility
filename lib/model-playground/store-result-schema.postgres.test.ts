import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { provenanceResult } from "./attempt-provenance.test-support";
import { createHarness, migrations, routingMigration } from "./store.postgres.test-support";
import { extendedResult } from "./store-result.test-support";

const { db } = createHarness(false);
const migration = () =>
  readFile(
    new URL(`../../prisma/migrations/${migrations.at(-1)}/migration.sql`, import.meta.url),
    "utf8",
  );

it("binds every new helper in a non-public schema under an empty search_path", async () => {
  try {
    await db.exec("CREATE SCHEMA evidence; SET search_path TO evidence");
    await db.exec(
      "CREATE TABLE model_playground_columns (LIKE public.model_playground_columns INCLUDING CONSTRAINTS)",
    );
    const {
      rows: [definition],
    } = await db.query<{ source: string }>(
      "SELECT pg_get_functiondef('public.model_playground_safe_json(jsonb)'::regprocedure) AS source",
    );
    await db.exec(
      definition.source.replace(
        "public.model_playground_safe_json",
        "evidence.model_playground_safe_json",
      ),
    );
    await db.exec(
      await readFile(
        new URL(`../../prisma/migrations/${migrations.at(-2)}/migration.sql`, import.meta.url),
        "utf8",
      ),
    );
    await db.exec(await migration());
    await db.exec(
      await readFile(
        new URL(`../../prisma/migrations/${routingMigration}/migration.sql`, import.meta.url),
        "utf8",
      ),
    );
    const {
      rows: [bound],
    } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='evidence' AND p.proconfig=ARRAY['search_path=evidence']`,
    );
    expect(bound.count).toBe(9);
    await db.exec("SET search_path TO ''");
    const value = extendedResult();
    const { rows } = await db.query(
      `SELECT evidence.model_playground_result_sources($1::jsonb) AS sources, evidence.model_playground_safe_json($1::jsonb) AS safe,
      evidence.model_playground_result_cost($2::jsonb) AS cost,
      evidence.model_playground_result_routing($3::jsonb) AS routing, evidence.model_playground_result_selection($4::jsonb) AS selection`,
      [
        JSON.stringify(value.consultedSources),
        JSON.stringify(value.costEvidence),
        JSON.stringify(provenanceResult().routingAttemptCredentials),
        JSON.stringify(value),
      ],
    );
    expect(rows).toEqual([
      { sources: true, safe: true, cost: true, routing: true, selection: true },
    ]);
  } finally {
    await db.exec("SET search_path TO public; DROP SCHEMA IF EXISTS evidence CASCADE");
  }
});

it("does not commit its caller's transaction", async () => {
  await db.exec("BEGIN; CREATE TABLE migration_atomicity_marker(id int)");
  await db.exec(await migration());
  await db.exec(
    await readFile(
      new URL(`../../prisma/migrations/${routingMigration}/migration.sql`, import.meta.url),
      "utf8",
    ),
  );
  await db.exec("ROLLBACK");
  const { rows } = await db.query("SELECT to_regclass('migration_atomicity_marker') AS marker");
  expect(rows).toEqual([{ marker: null }]);
});
