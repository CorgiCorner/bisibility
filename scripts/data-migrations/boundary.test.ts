import { describe, expect, it } from "vitest";
import type { DataMigrationManifestEntry } from "@/lib/data-migrations/manifest";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { lintDataMigrationReleaseBoundaries } from "./boundary";

const pending = {
  checksum: "a".repeat(64),
  contractMigrationId: "20260728063000_contract",
  execution: "deploy-blocking",
  id: "20260728060000_prepare",
  lifecycle: "active",
  prerequisiteSchemaMigrationId: "20260728050000_ledger",
} as const satisfies DataMigrationManifestEntry;

function fileSystem(files: Readonly<Record<string, string>>) {
  return {
    exists: async (path: string) =>
      Object.hasOwn(files, path.replaceAll("\\", "/")),
    read: async (path: string) => files[path.replaceAll("\\", "/")] ?? "",
  };
}

const prerequisite = "/repo/prisma/migrations/20260728050000_ledger/migration.sql";
const contract = "/repo/prisma/migrations/20260728063000_contract/migration.sql";

describe("data migration release boundary", () => {
  it("accepts the repository's enforced boundary", async () => {
    await expect(
      lintDataMigrationReleaseBoundaries(process.cwd(), dataMigrationManifest),
    ).resolves.toBeUndefined();
  });

  it("accepts an active data migration only while its contract is absent", async () => {
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [pending],
        fileSystem({ [prerequisite]: "" }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [pending],
        fileSystem({ [contract]: "", [prerequisite]: "" }),
      ),
    ).rejects.toThrow("must not ship contract schema migration");
  });

  it("requires the exact prerequisite, preparation, and contract timestamp order", async () => {
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [{ ...pending, contractMigrationId: "20260728055000_contract" }],
        fileSystem({ [prerequisite]: "" }),
      ),
    ).rejects.toThrow("must be ordered");
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [{ ...pending, prerequisiteSchemaMigrationId: "20260728061000_ledger" }],
        fileSystem({ [prerequisite]: "" }),
      ),
    ).rejects.toThrow("must be ordered");
  });

  it("accepts an enforced contract only when its migration is self-guarding", async () => {
    const retired = {
      ...pending,
      lifecycle: "retired",
    } as const satisfies DataMigrationManifestEntry;
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [retired],
        fileSystem({
          [contract]: [
            "-- data-migration-contract: self-guarding",
            "SET lock_timeout = '5s';",
            "DO $$ BEGIN RAISE EXCEPTION 'guard'; END $$;",
          ].join("\n"),
          [prerequisite]: "",
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      lintDataMigrationReleaseBoundaries(
        "/repo",
        [retired],
        fileSystem({ [contract]: "SELECT 1;", [prerequisite]: "" }),
      ),
    ).rejects.toThrow("self-guard lint marker");
  });
});
