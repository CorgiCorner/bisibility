import { describe, expect, it, vi } from "vitest";
import { DATA_MIGRATION_RECOVERY_COMMAND, dataMigrationManifest } from "./manifest";
import { assertMigrationsReady, readMigrationReadiness } from "./readiness";

function lifecycleDatabase(state: "clean" | "installed" | "partial", catalogReady = true) {
  return {
    $queryRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
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
  it("retires the blocking runner without losing the historical checksum", () => {
    expect(dataMigrationManifest).toHaveLength(1);
    expect(dataMigrationManifest[0]).toMatchObject({
      blocking: false,
      checksum: "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
      contractState: "enforced",
    });
  });

  it.each(["installed", "clean"] as const)(
    "accepts the complete final catalog when N1 artifacts are %s",
    async (state) => {
      await expect(readMigrationReadiness(lifecycleDatabase(state))).resolves.toBe("ready");
    },
  );

  it("rejects a partial lifecycle cleanup", async () => {
    const db = lifecycleDatabase("partial");
    await expect(readMigrationReadiness(db)).resolves.toBe("incomplete");
    await expect(assertMigrationsReady(db)).rejects.toThrow(DATA_MIGRATION_RECOVERY_COMMAND);
  });

  it("rejects an incomplete final catalog", async () => {
    await expect(readMigrationReadiness(lifecycleDatabase("clean", false))).resolves.toBe(
      "incomplete",
    );
  });

  it("fails closed when catalog state cannot be read", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    await expect(assertMigrationsReady(db)).rejects.toThrow("database unavailable");
  });
});
