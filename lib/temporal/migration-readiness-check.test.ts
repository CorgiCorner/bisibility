import { describe, expect, it, vi } from "vitest";
import { activeDataMigrationManifest } from "../data-migrations/manifest";
import {
  migrationReadinessFailure,
  migrationReadinessOutput,
  migrationReadinessReport,
} from "./migration-readiness-check";

const BUNDLED = ["20260901000000_first", "20260912210000_add_user_ui_locale"];

type DataMigrationRow = { checksum: string; finishedAt: Date | null; id: string };

function completedDataMigrations(): DataMigrationRow[] {
  return activeDataMigrationManifest().map((migration) => ({
    checksum: migration.checksum,
    finishedAt: new Date("2026-09-15T20:00:00.000Z"),
    id: migration.id,
  }));
}

function migrationDatabase(
  appliedMigrations: readonly string[],
  dataLedger: { exists?: boolean; rows?: DataMigrationRow[] } = {},
) {
  const { exists = true, rows = completedDataMigrations() } = dataLedger;
  return {
    $queryRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('SELECT "migration_name"')) {
        return appliedMigrations.map((migration_name) => ({ migration_name }));
      }
      if (query.includes("to_regclass")) return [{ exists }];
      if (query.includes('FROM "data_migrations"')) return rows;
      throw new Error(`Unexpected query: ${query}`);
    }),
  };
}

describe("worker migration readiness preflight", () => {
  it("passes when the database has every bundled schema and data migration", async () => {
    const report = await migrationReadinessReport(migrationDatabase(BUNDLED), BUNDLED);

    expect(report.exitCode).toBe(0);
    expect(report.lines.join("\n")).toContain("Migration preflight passed");
  });

  it("fails and names every pending migration when the database is behind", async () => {
    const report = await migrationReadinessReport(migrationDatabase([BUNDLED[0]]), BUNDLED);

    expect(report.exitCode).toBe(1);
    const output = report.lines.join("\n");
    expect(output).toContain("behind this worker image by 1 migration(s)");
    expect(output).toContain("pending: 20260912210000_add_user_ui_locale");
    expect(output).not.toContain(BUNDLED[0]);
    expect(output).toContain("this database's own migration role");
    expect(output).toContain("npm run db:migrate");
    // The same image runs this preflight against the production and the demo
    // database, which are migrated by different roles, so the remediation names
    // neither and points at the playbook that owns each one.
    expect(output).not.toMatch(/bisibility_migrate|bisibility_app|DATABASE_URL/);
    expect(output).toContain("PLAYBOOK.md");
    expect(output).toContain("DEMO.md");
  });

  it("fails when the database has applied nothing at all", async () => {
    const report = await migrationReadinessReport(migrationDatabase([]), BUNDLED);

    expect(report.exitCode).toBe(1);
    for (const migration of BUNDLED) {
      expect(report.lines.join("\n")).toContain(`pending: ${migration}`);
    }
  });

  it("fails on incomplete deploy-blocking data migrations even when the schema is current", async () => {
    const active = activeDataMigrationManifest();
    expect(active.length).toBeGreaterThan(0);

    const report = await migrationReadinessReport(
      migrationDatabase(BUNDLED, { rows: [] }),
      BUNDLED,
    );

    expect(report.exitCode).toBe(1);
    const output = report.lines.join("\n");
    expect(output).toContain(`${active.length} deploy-blocking data migration(s)`);
    for (const migration of active) {
      expect(output).toContain(`pending data migration: ${migration.id}`);
    }
    expect(output).toContain("npm run db:migrate");
    expect(output).toContain("'npx prisma migrate deploy' does not run them");
  });

  it("fails on a data migration whose recorded checksum no longer matches", async () => {
    const rows = completedDataMigrations();
    const report = await migrationReadinessReport(
      migrationDatabase(BUNDLED, {
        rows: [{ ...rows[0], checksum: "0".repeat(64) }, ...rows.slice(1)],
      }),
      BUNDLED,
    );

    expect(report.exitCode).toBe(1);
    expect(report.lines.join("\n")).toContain(`pending data migration: ${rows[0].id}`);
  });

  it("fails when the data migration ledger table does not exist yet", async () => {
    const report = await migrationReadinessReport(
      migrationDatabase(BUNDLED, { exists: false }),
      BUNDLED,
    );

    expect(report.exitCode).toBe(1);
    expect(report.lines.join("\n")).toContain("deploy-blocking data migration(s)");
  });

  it("propagates an unreadable database so the entry point can fail closed", async () => {
    const db = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")) };

    await expect(migrationReadinessReport(db, BUNDLED)).rejects.toThrow("database unavailable");
  });
});

// The entry point itself only performs effects (write the lines, set the exit
// code, disconnect); these two pure functions are the decisions it makes, so
// the exit path is covered without a database.
describe("worker migration readiness entry point decisions", () => {
  it("sends a passing report to stdout and exits zero", async () => {
    const report = await migrationReadinessReport(migrationDatabase(BUNDLED), BUNDLED);
    const output = migrationReadinessOutput(report);

    expect(output.exitCode).toBe(0);
    expect(output.stdout).toEqual(report.lines);
    expect(output.stderr).toEqual([]);
  });

  it("sends a failing report to stderr and exits one", async () => {
    const report = await migrationReadinessReport(migrationDatabase([]), BUNDLED);
    const output = migrationReadinessOutput(report);

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toEqual(report.lines);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join("\n")).toContain("pending: 20260912210000_add_user_ui_locale");
  });

  it("fails closed on an unreadable database without echoing the driver message", () => {
    const error = Object.assign(
      new Error("connect ECONNREFUSED postgresql://role:pw@db.internal:5432/name"),
      { code: "ECONNREFUSED", name: "PrismaClientInitializationError" },
    );

    const output = migrationReadinessFailure(error);

    expect(output.exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    const rendered = output.stderr.join("\n");
    expect(rendered).toContain("PrismaClientInitializationError ECONNREFUSED");
    expect(rendered).not.toContain("db.internal");
    expect(rendered).not.toContain("postgresql://");
  });

  it("fails closed on a thrown non-error value", () => {
    const output = migrationReadinessFailure("boom");

    expect(output.exitCode).toBe(1);
    expect(output.stderr.join("\n")).toContain("(string)");
  });
});
