import { describe, expect, it, vi } from "vitest";
import { DATA_MIGRATION_RECOVERY_COMMAND, dataMigrationManifest } from "./manifest";
import { assertMigrationsReady, readMigrationReadiness } from "./readiness";

function lifecycleDatabase(
  state: "clean" | "installed" | "partial",
  catalogReady = true,
  appliedMigrations = ["migration_a"],
) {
  return {
    $queryRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('SELECT "migration_name"')) {
        return appliedMigrations.map((migration_name) => ({ migration_name }));
      }
      if (query.includes("WITH required")) return [{ ready: catalogReady }];
      if (query.includes('AS "functionInstalled"')) {
        if (state === "clean") {
          return [
            {
              functionInstalled: false,
              gateInstalled: false,
              ledgerInstalled: false,
              triggerCount: 0,
            },
          ];
        }
        return [
          {
            functionInstalled: true,
            gateInstalled: true,
            ledgerInstalled: state === "installed",
            triggerCount: 25,
          },
        ];
      }
      return [{ ready: state === "installed" }];
    }),
  };
}

describe("final migration readiness", () => {
  it("retires the deploy-blocking implementation without losing audit metadata", () => {
    expect(dataMigrationManifest).toHaveLength(1);
    expect(dataMigrationManifest[0]).toMatchObject({
      checksum: "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
      execution: "deploy-blocking",
      lifecycle: "retired",
    });
  });

  it.each(["installed", "clean"] as const)(
    "accepts the complete final catalog when N1 artifacts are %s",
    async (state) => {
      await expect(readMigrationReadiness(lifecycleDatabase(state), ["migration_a"])).resolves.toBe(
        "ready",
      );
    },
  );

  it("rejects a bundled Prisma migration that has not been applied", async () => {
    const db = lifecycleDatabase("clean", true, []);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    await expect(assertMigrationsReady(db, ["migration_a"])).rejects.toThrow(
      "npx prisma migrate deploy",
    );
  });

  it("becomes ready after the bundled Prisma migration is applied", async () => {
    const appliedMigrations: string[] = [];
    const db = lifecycleDatabase("clean", true, appliedMigrations);

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    appliedMigrations.push("migration_a");
    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
  });

  it("adds one query to the ready clean-contract path", async () => {
    const db = lifecycleDatabase("clean");

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it("adds one query to the ready installed-artifact path", async () => {
    const db = lifecycleDatabase("installed");

    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("ready");
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(4);
  });

  it("rejects a partial lifecycle cleanup", async () => {
    const db = lifecycleDatabase("partial");
    await expect(readMigrationReadiness(db, ["migration_a"])).resolves.toBe("incomplete");
    await expect(assertMigrationsReady(db, ["migration_a"])).rejects.toThrow(
      DATA_MIGRATION_RECOVERY_COMMAND,
    );
  });

  it("rejects an incomplete final catalog", async () => {
    await expect(
      readMigrationReadiness(lifecycleDatabase("clean", false), ["migration_a"]),
    ).resolves.toBe("incomplete");
  });

  it("fails closed when catalog state cannot be read", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    await expect(assertMigrationsReady(db)).rejects.toThrow("database unavailable");
  });
});
