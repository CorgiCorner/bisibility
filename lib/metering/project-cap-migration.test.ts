import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";
import { projectSpendingBudget } from "./spending-limits";
import { canonical, decode, encode } from "./store/codec";

const migration = readFileSync(
  "prisma/migrations/20261011050000_drop_project_spending_cap/migration.sql",
  "utf8",
);
const backfill = migration.split("CREATE OR REPLACE FUNCTION")[0];
const storeSchema = readFileSync(
  "prisma/migrations/20260924011626_metering_shadow/migration.sql",
  "utf8",
)
  .split("CREATE TABLE metering_budget (")[1]
  .split("CREATE TABLE metering_event (")[0];
const snapshotSchema = readFileSync(
  "prisma/migrations/20261011020000_accounting_history_snapshot/migration.sql",
  "utf8",
);

const baselineSchema = readFileSync(
  "prisma/migrations/20260806000000_squashed_migrations/migration.sql",
  "utf8",
);

async function setup(db: PGlite) {
  await db.exec(`CREATE TABLE projects(id text, "budgetCapCents" int DEFAULT 5000,
    "ownerId" text, "writeMode" text, "isSample" boolean, "providerUiRevision" int DEFAULT 0);
    ${baselineSchema.match(/CREATE TABLE "data_migrations" \([\s\S]*?\n\);/)?.[0]}
    ${snapshotSchema.match(/CREATE TABLE metering_history_progress \([\s\S]*?\n\);/)?.[0]}
    ${snapshotSchema.match(/CREATE TABLE metering_legacy_setting_source \([\s\S]*?\n\);/)?.[0]}
    CREATE TABLE metering_budget (${storeSchema}
    INSERT INTO metering_history_progress(migration_id,namespace,verified_at) VALUES('20261011021000_accounting_history','test',now());`);
  await db.exec(
    snapshotSchema.match(
      /CREATE FUNCTION metering_history_source_immutable\(\)[\s\S]*?END \$\$;/,
    )?.[0] ?? "",
  );
  await db.exec(
    snapshotSchema.match(/CREATE TRIGGER metering_history_setting_immutable[^;]+;/)?.[0] ?? "",
  );
}

async function seedBudget(db: PGlite, cap = "777", version = 2) {
  const budget = projectSpendingBudget("test", "existing", cap, version);
  await db.query(
    `INSERT INTO metering_budget(namespace,budget_id,version,scope_kind,scope_key,surface,unit,
      limit_value,limit_scale,"window",on_exceed,body)
      VALUES('test',$1,$5,'group',$2,'any','budget_cents',$6,4,$3,'block',$4)`,
    [
      budget.id,
      canonical(budget.scope),
      encode(budget.window),
      encode(budget),
      version,
      budget.limit?.value.toString() ?? null,
    ],
  );
  return budget;
}

test.each([1234, null, 0, -1])(
  "cap retirement preserves a late project's cap %s and records it idempotently",
  async (cap) => {
    const db = new PGlite();
    try {
      await setup(db);
      await db.exec(
        "INSERT INTO data_migrations(id,checksum,\"startedAt\",\"finishedAt\") VALUES('20261011021000_accounting_history','test',now(),now());",
      );
      await db.query('INSERT INTO projects(id,"budgetCapCents") VALUES ($1,$2)', ["late", cap]);
      await db.exec(`${backfill}COMMIT;`);
      await db.exec(`${backfill}COMMIT;`);
      await db.exec(migration);
      await db.exec(migration);
      const expected = projectSpendingBudget("test", "late", String(cap ?? 5000), 1);
      const { rows } = await db.query<{ body: unknown; scope_key: string }>(
        "SELECT body,scope_key FROM metering_budget",
      );
      expect(rows).toHaveLength(1);
      expect(decode(rows[0].body)).toEqual(expected);
      expect(rows[0].scope_key).toBe(canonical(expected.scope));
      expect(
        (await db.query("SELECT kind,source_id,payload FROM metering_legacy_setting_source")).rows,
      ).toEqual([
        {
          kind: "project_cap_drop",
          source_id: "late",
          payload: {
            migrationId: "20261011050000_drop_project_spending_cap",
            namespace: "test",
            budgetCapCents: cap === null ? null : String(cap),
            budget: rows[0].body,
          },
        },
      ]);
      await expect(db.query('SELECT "budgetCapCents" FROM projects')).rejects.toThrow();
    } finally {
      await db.close();
    }
  },
  15000,
);

test("an empty database can retire the cap without an import ledger", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE projects(id text, "budgetCapCents" int DEFAULT 5000,
      "ownerId" text, "writeMode" text, "isSample" boolean, "providerUiRevision" int DEFAULT 0);`);
    await db.exec(migration);
    await expect(db.query('SELECT "budgetCapCents" FROM projects')).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 15000);

test("cap retirement requires verified history, preserves existing Store values and keeps revision triggers", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`INSERT INTO projects(id) VALUES('existing');
      INSERT INTO metering_legacy_setting_source VALUES('project','existing','{"id":"existing","budgetCapCents":"100"}');`);
    const budget = await seedBudget(db);
    await expect(db.exec(migration)).rejects.toThrow("Complete and verify accounting history");
    await db.exec(`ROLLBACK; INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
      UPDATE metering_history_progress SET verified_at=NULL;`);
    await expect(db.exec(migration)).rejects.toThrow("Every project cap");
    await db.exec(
      "ROLLBACK; UPDATE metering_history_progress SET verified_at=now(),namespace=NULL;",
    );
    await expect(db.exec(migration)).rejects.toThrow("Every project cap");
    await db.exec("ROLLBACK; UPDATE metering_history_progress SET namespace='test';");
    await db.exec(migration);
    expect(
      decode((await db.query<{ body: unknown }>("SELECT body FROM metering_budget")).rows[0].body),
    ).toEqual(budget);
    expect(
      (await db.query("SELECT * FROM metering_legacy_setting_source WHERE kind='project_cap_drop'"))
        .rows,
    ).toEqual([]);
    await db.exec(`CREATE TRIGGER revision BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION provider_ui_project_revision();
      UPDATE projects SET "ownerId"='new-owner';`);
    expect((await db.query('SELECT "providerUiRevision" FROM projects')).rows).toEqual([
      { providerUiRevision: 1 },
    ]);
  } finally {
    await db.close();
  }
}, 15000);

test("inconsistent Store data rolls back late-project backfill and a repaired retry succeeds", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await seedBudget(db);
    await db.exec(`INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
      INSERT INTO projects(id,"budgetCapCents") VALUES('existing',5000),('late',1234);
      UPDATE metering_budget SET unit='cents';`);
    await expect(db.exec(migration)).rejects.toThrow("Every project cap");
    await db.exec("ROLLBACK;");
    expect((await db.query("SELECT * FROM metering_legacy_setting_source")).rows).toEqual([]);
    expect((await db.query("SELECT budget_id FROM metering_budget")).rows).toEqual([
      { budget_id: "project:existing:monthly" },
    ]);
    expect(
      (await db.query("SELECT \"budgetCapCents\" FROM projects WHERE id='late'")).rows,
    ).toEqual([{ budgetCapCents: 1234 }]);
    await db.exec("UPDATE metering_budget SET unit='budget_cents';");
    await db.exec(migration);
    expect((await db.query("SELECT budget_id FROM metering_budget")).rows).toHaveLength(2);
  } finally {
    await db.close();
  }
}, 15000);

test("conflicting backfill provenance blocks the drop without losing the cap", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
      INSERT INTO projects(id,"budgetCapCents") VALUES('late',1234);
      INSERT INTO metering_legacy_setting_source VALUES('project_cap_drop','late','{}');`);
    await expect(db.exec(migration)).rejects.toThrow("Project cap backfill provenance conflicts");
    await db.exec("ROLLBACK;");
    expect((await db.query('SELECT "budgetCapCents" FROM projects')).rows).toEqual([
      { budgetCapCents: 1234 },
    ]);
    expect((await db.query("SELECT * FROM metering_budget")).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 15000);

test.each([200, 0, -1, null])(
  "cap retirement preserves an imported project's post-snapshot edit to %s",
  async (cap) => {
    const db = new PGlite();
    try {
      await setup(db);
      await db.exec(`INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
        INSERT INTO metering_legacy_setting_source VALUES('project','existing','{"id":"existing","budgetCapCents":"100"}');`);
      await seedBudget(db, "100", 1);
      await db.query('INSERT INTO projects(id,"budgetCapCents") VALUES ($1,$2)', ["existing", cap]);
      await db.exec(`${backfill}COMMIT;`);
      const expected = projectSpendingBudget("test", "existing", String(cap ?? 5000), 2);
      const rows = (
        await db.query<{ body: unknown }>("SELECT body FROM metering_budget ORDER BY version")
      ).rows;
      expect(rows).toHaveLength(2);
      expect(decode(rows[1].body)).toEqual(expected);
      const before = (
        await db.query("SELECT * FROM metering_legacy_setting_source ORDER BY kind,source_id")
      ).rows;
      expect(before).toContainEqual({
        kind: "project_cap_drop",
        source_id: "existing",
        payload: {
          migrationId: "20261011050000_drop_project_spending_cap",
          namespace: "test",
          budgetCapCents: cap === null ? null : String(cap),
          budget: rows[1].body,
          importedBudgetVersion: 1,
          snapshotBudgetCapCents: "100",
        },
      });
      await db.exec(`${backfill}COMMIT;`);
      expect((await db.query("SELECT body FROM metering_budget ORDER BY version")).rows).toEqual(
        rows,
      );
      await db.exec("DELETE FROM metering_budget WHERE version=2;");
      await db.exec(`${backfill}COMMIT;`);
      expect((await db.query("SELECT body FROM metering_budget ORDER BY version")).rows).toEqual(
        rows,
      );
      expect(
        (await db.query("SELECT * FROM metering_legacy_setting_source ORDER BY kind,source_id"))
          .rows,
      ).toEqual(before);
    } finally {
      await db.close();
    }
  },
  15000,
);

test("cap retirement preserves late edits when projects is in a later search_path schema", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
      INSERT INTO metering_legacy_setting_source VALUES('project','existing','{"id":"existing","budgetCapCents":"100"}');
      INSERT INTO public.projects(id,"budgetCapCents") VALUES('existing',200);`);
    await seedBudget(db, "100", 1);
    await db.exec("CREATE SCHEMA other; SET search_path TO other, public;");
    expect((await db.query("SELECT current_schema()")).rows).toEqual([{ current_schema: "other" }]);

    await db.exec(migration);

    const { rows } = await db.query<{ version: number; body: unknown }>(
      "SELECT version,body FROM public.metering_budget ORDER BY version",
    );
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(decode(rows[1].body)).toEqual(projectSpendingBudget("test", "existing", "200", 2));
    await expect(db.query('SELECT "budgetCapCents" FROM public.projects')).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 15000);

test("matching provenance restores an absent backfilled budget on rerun", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`INSERT INTO data_migrations(id,checksum,"startedAt","finishedAt") VALUES('20261011021000_accounting_history','test',now(),now());
      INSERT INTO projects(id,"budgetCapCents") VALUES('late',1234);`);
    await db.exec(`${backfill}COMMIT;`);
    const before = (await db.query("SELECT * FROM metering_legacy_setting_source")).rows;
    await db.exec("DELETE FROM metering_budget;");
    await db.exec(`${backfill}COMMIT;`);
    expect((await db.query("SELECT * FROM metering_legacy_setting_source")).rows).toEqual(before);
    const rows = (await db.query<{ body: unknown }>("SELECT body FROM metering_budget")).rows;
    expect(rows).toHaveLength(1);
    expect(decode(rows[0].body)).toEqual(projectSpendingBudget("test", "late", "1234", 1));
  } finally {
    await db.close();
  }
}, 15000);
