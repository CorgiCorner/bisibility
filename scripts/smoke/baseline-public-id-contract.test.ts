import type pg from "pg";
import { describe, expect, it } from "vitest";
import { assertBaselinePublicIdCatalog } from "./baseline-public-id-contract";

// Independent catalog expectations include the names recorded by the applied SQL.
const entries = [
  ["usr", "users"], ["prj", "projects"], ["kw", "keywords"], ["check", "rank_checks"],
  ["biz", "business_locations"], ["lmt", "local_measurement_targets"],
  ["lmr", "local_measurement_runs"], ["lmn", "local_monitors"], ["lmj", "local_monitor_launch_intents"],
  ["agr", "agent_reports"], ["ait", "ai_topics"], ["aip", "ai_prompts"],
  ["apr", "ai_prompt_revisions"], ["ais", "ai_tracking_schedules"], ["air", "ai_tracking_runs"],
  ["asm", "ai_tracking_samples"], ["asg", "ai_tracking_suggestion_generations"],
  ["al", "triggered_alerts"], ["alr", "alert_rules"], ["audit", "audit_logs"],
  ["cmp", "competitors"], ["conn", "provider_connections"], ["dpt", "device_push_tokens"],
  ["dwh", "ingest_hooks"],
  ["ferry", "migration_tokens"], ["imp", "cloud_import_jobs"], ["inv", "invites"],
  ["key", "api_keys"], ["mbr", "memberships"], ["ntf", "notifications"],
  ["pat", "personal_access_tokens"], ["pmkt", "project_markets"], ["rcr", "rank_check_runs"],
  ["sch", "check_schedules"], ["sid", "sessions"], ["sig", "signals"],
  ["svkw", "saved_keywords"], ["tag", "tags"], ["viw", "saved_views"], ["we", "webhook_endpoints"],
] as const;
function catalog() {
  const columns = entries.map(([, table]) => ({ table: table as string, isNullable: "NO" }));
  const constraints = entries.map(([prefix, table]) => ({
    table: table as string, schema: "owned_fixture", validated: true,
    name: `${table}_public_id_contract_format`,
    definition: `CHECK (("publicId" ~ '^${prefix}_[a-z][a-z0-9]{23}$'::text))`,
  }));
  const db = {
    async query(sql: string, args?: string[][]) {
      if (sql.includes("information_schema.columns")) {
        expect(sql).toContain("table_schema = current_schema()");
        expect(args?.[0]).toHaveLength(40);
        return { rows: columns };
      }
      if (sql.includes("pg_constraint")) {
        expect(sql).toContain("namespace_meta.nspname = current_schema()");
        expect(args?.[0]).toHaveLength(40);
        return { rows: constraints };
      }
      return { rows: [{ schema: "owned_fixture" }] };
    },
  } as unknown as Pick<pg.Client, "query">;
  return { db, columns, constraints };
}

describe("baseline public-ID catalog authority", () => {
  it("accepts all 40 current canonical table guards after the identifier migration", async () => {
    expect(entries).toHaveLength(40);
    await expect(assertBaselinePublicIdCatalog(catalog().db, "owned_fixture")).resolves.toBeUndefined();
  });

  it.each(["missing", "renamed", "wrong table", "foreign schema", "unvalidated", "wrong prefix", "weaker suffix"])(
    "refuses a %s business-location format guard", async (defect) => {
      const fixture = catalog();
      const guard = fixture.constraints.find((row) => row.table === "business_locations")!;
      if (defect === "missing") fixture.constraints.splice(fixture.constraints.indexOf(guard), 1);
      if (defect === "renamed") guard.name = "unrelated_guard";
      if (defect === "wrong table") guard.table = "unrelated_table";
      if (defect === "foreign schema") guard.schema = "foreign_fixture";
      if (defect === "unvalidated") guard.validated = false;
      if (defect === "wrong prefix") guard.definition = guard.definition.replace("biz_", "prj_");
      if (defect === "weaker suffix") guard.definition = guard.definition.replace("{23}", "{1,23}");
      await expect(assertBaselinePublicIdCatalog(fixture.db, "owned_fixture")).rejects.toThrow();
    },
  );

  it.each(["missing", "nullable", "unrelated"])("refuses a %s public-ID column", async (defect) => {
    const fixture = catalog();
    const column = fixture.columns.find((row) => row.table === "business_locations")!;
    if (defect === "missing") fixture.columns.splice(fixture.columns.indexOf(column), 1);
    if (defect === "nullable") column.isNullable = "YES";
    if (defect === "unrelated") column.table = "unrelated_table" as typeof column.table;
    await expect(assertBaselinePublicIdCatalog(fixture.db, "owned_fixture")).rejects.toThrow();
  });
});

it("refuses a migrated sentinel schema instead of the requested fixture schema", async () => {
  await expect(assertBaselinePublicIdCatalog(catalog().db, "other_owned_fixture")).rejects.toThrow("owned database schema");
});

it.each(["local_measurement_targets", "local_measurement_runs", "local_monitor_launch_intents"])("rejects the retired alias instead of the current %s constraint", async (table) => {
  const fixture = catalog();
  const guard = fixture.constraints.find((row) => row.table === table)!;
  guard.name = "retired_alias";
  await expect(assertBaselinePublicIdCatalog(fixture.db, "owned_fixture")).rejects.toThrow();
});
