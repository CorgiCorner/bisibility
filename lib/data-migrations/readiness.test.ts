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

describe("migration readiness", () => {
  it("starts the new baseline generation with an empty data migration manifest", () => {
    expect(dataMigrationManifest).toEqual([]);
  });

  it("accepts the bundled Prisma migration without lifecycle-specific catalog queries", async () => {
    const db = migrationDatabase();

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
    expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
  });

  it("rejects a bundled Prisma migration that has not been applied", async () => {
    const db = migrationDatabase([]);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    await expect(assertMigrationsReady(db, ["migration_a"])).rejects.toThrow(
      "npx prisma migrate deploy",
    );
  });

  it("becomes ready after the bundled Prisma migration is applied", async () => {
    const appliedMigrations: string[] = [];
    const db = migrationDatabase(appliedMigrations);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    appliedMigrations.push("migration_a");
    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
  });

  it("fails closed when migration state cannot be read", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    await expect(assertMigrationsReady(db)).rejects.toThrow("database unavailable");
  });
});
