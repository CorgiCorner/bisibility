import "server-only";

import { DATA_MIGRATION_RECOVERY_COMMAND } from "../data-migrations/manifest";
import {
  type ReadinessDatabase,
  readPendingDataMigrations,
  readPendingPrismaMigrations,
} from "../data-migrations/readiness";

/**
 * Host-side deploy preflight for the worker image.
 *
 * The worker refuses to start when the migrations bundled in its image are not
 * applied yet, and the container supervisor then restarts it forever while the
 * synchronization script still reports success (incident 2026-09-15). Running
 * this report from the NEW image, before the running worker is replaced, turns
 * that crash loop into a refusal to deploy.
 *
 * It covers both classes the worker itself refuses on: pending Prisma schema
 * migrations and incomplete deploy-blocking data migrations. The data class
 * matters because `npx prisma migrate deploy` does not run it, so an operator
 * who applies only the schema would otherwise pass the preflight and get the
 * identical crash loop.
 *
 * The report never contains a connection string, a host, or a role name. It
 * carries bundled migration identifiers, which are public repository content,
 * plus remediation text that points at the playbooks instead of naming a role:
 * the same entry point runs against the production and the demo database, and
 * each one is migrated by its own migration role.
 */
export type MigrationReadinessReport = {
  exitCode: 0 | 1;
  lines: string[];
};

const MIGRATION_ROLE_REMEDIATION = [
  "Apply the pending migrations to THIS database from the protected operator shell,",
  `with this database's own migration role and the exact approved checkout (${DATA_MIGRATION_RECOVERY_COMMAND}).`,
  "PLAYBOOK.md names the production migration role; DEMO.md names the demo target",
  "migration role. Then rerun this sync.",
];

const PRISMA_REMEDIATION = [
  ...MIGRATION_ROLE_REMEDIATION,
  "A runtime role cannot migrate: it fails with",
  "'permission denied for table _prisma_migrations'.",
];

const DATA_REMEDIATION = [
  ...MIGRATION_ROLE_REMEDIATION,
  "'npx prisma migrate deploy' does not run them: the worker reads their",
  "completion from the data_migrations ledger and refuses to start without it.",
];

export async function migrationReadinessReport(
  db?: ReadinessDatabase,
  migrations?: readonly string[],
): Promise<MigrationReadinessReport> {
  const pendingPrisma = await readPendingPrismaMigrations(db, migrations);
  if (pendingPrisma.length > 0) {
    return {
      exitCode: 1,
      lines: [
        `Migration preflight failed: the database is behind this worker image by ${pendingPrisma.length} migration(s).`,
        ...pendingPrisma.map((migration) => `  pending: ${migration}`),
        ...PRISMA_REMEDIATION,
      ],
    };
  }

  const pendingData = await readPendingDataMigrations(db);
  if (pendingData.length > 0) {
    return {
      exitCode: 1,
      lines: [
        `Migration preflight failed: ${pendingData.length} deploy-blocking data migration(s) bundled in this worker image are incomplete.`,
        ...pendingData.map((migration) => `  pending data migration: ${migration}`),
        ...DATA_REMEDIATION,
      ],
    };
  }

  return {
    exitCode: 0,
    lines: [
      "Migration preflight passed: the database has every schema and data migration bundled in this image.",
    ],
  };
}

/**
 * Where a finished report belongs on the preflight's streams, and the exit code
 * the host-side installer reads. A passing report is progress output; a failing
 * one is the operator's remediation and must land on stderr next to the other
 * aborts of the sync script.
 */
export type MigrationReadinessOutput = {
  exitCode: 0 | 1;
  stderr: string[];
  stdout: string[];
};

export function migrationReadinessOutput(
  report: MigrationReadinessReport,
): MigrationReadinessOutput {
  return report.exitCode === 0
    ? { exitCode: 0, stderr: [], stdout: [...report.lines] }
    : { exitCode: 1, stderr: [...report.lines], stdout: [] };
}

/**
 * Fail-closed output for a database whose migration state could not be read.
 * It names the failure class without echoing the message: a driver error can
 * carry the connection string, the host, or the role name.
 */
export function migrationReadinessFailure(error: unknown): MigrationReadinessOutput {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  const detail = [name, typeof code === "string" ? code : undefined].filter(Boolean).join(" ");
  return {
    exitCode: 1,
    stderr: [
      `Migration preflight failed: could not read migration state from the database (${detail}).`,
    ],
    stdout: [],
  };
}
