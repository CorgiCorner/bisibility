import { describe, expect, it, vi } from "vitest";
import { dataMigrationManifest } from "./manifest";
import { assertMigrationsReady, readMigrationReadiness } from "./readiness";

function migrationDatabase(appliedMigrations = ["migration_a"]) {
  return {
    $queryRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('SELECT "migration_name"')) {
        return appliedMigrations.map((migration_name) => ({ migration_name }));
      }
      throw new Error(`Unexpected query: ${query}`);
    }),
  };
}

function dataMigrationDatabase(state: { finishedAt: Date | null; ledgerExists: boolean }) {
  const migrations = dataMigrationManifest.filter(({ lifecycle }) => lifecycle === "active");

  return {
    $queryRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('SELECT "migration_name"')) {
        return [{ migration_name: "migration_a" }];
      }
      if (query.includes("to_regclass('data_migrations')")) {
        return [{ exists: state.ledgerExists }];
      }
      if (query.includes('FROM "data_migrations"')) {
        return migrations.map((migration) => ({
          checksum: migration.checksum,
          finishedAt: state.finishedAt,
          id: migration.id,
        }));
      }
      throw new Error(`Unexpected query: ${query}`);
    }),
  };
}

describe("migration readiness", () => {
  it("reads the current data migration manifest", () => {
    expect(dataMigrationManifest.map(({ id, lifecycle }) => ({ id, lifecycle }))).toEqual([
      {
        id: "20260902033000_keyword_schedules_to_check_schedules",
        lifecycle: "active",
      },
      { id: "20260904210000_run_start_semantics", lifecycle: "active" },
    ]);
  });

  it("rejects the bundled Prisma migration when the data migration ledger is missing", async () => {
    const db = dataMigrationDatabase({ finishedAt: null, ledgerExists: false });

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("rejects a bundled Prisma migration that has not been applied", async () => {
    const db = migrationDatabase([]);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    await expect(assertMigrationsReady(db, ["migration_a"])).rejects.toThrow(
      "npx prisma migrate deploy",
    );
  });

  it("becomes ready only after all registered data migrations finish", async () => {
    const state = { finishedAt: null as Date | null, ledgerExists: true };
    const db = dataMigrationDatabase(state);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    state.finishedAt = new Date();
    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
  });

  it("does not become ready with only the previous migration applied", async () => {
    const previous = dataMigrationManifest[0];
    const db = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ migration_name: "migration_a" }])
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([
          { id: previous.id, checksum: previous.checksum, finishedAt: new Date() },
        ]),
    };
    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
  });

  it("fails closed when migration state cannot be read", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    await expect(assertMigrationsReady(db)).rejects.toThrow("database unavailable");
  });
});
