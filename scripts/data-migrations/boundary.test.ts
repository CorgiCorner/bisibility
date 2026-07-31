import { createHash } from "node:crypto";
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

  it("requires the repository contract to self-guard without ledger gates", async () => {
    const sql = await import("node:fs/promises").then((fs) =>
      fs.readFile("prisma/migrations/20260728063000_public_id_contract/migration.sql", "utf8"),
    );

    expect(sql).toContain("-- data-migration-contract: self-guarding");
    expect(sql).not.toMatch(/data_migrations/);
    expect(sql).not.toMatch(/public_id_migrations(?!\";)/);
  });

  it("keeps N1 lifecycle artifacts for exact-release operator cleanup", async () => {
    const sql = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        "prisma/migrations/20260729220000_public_id_v3_contract/migration.sql",
        "utf8",
      ),
    );

    expect(sql).toContain("-- data-migration-contract: self-guarding");
    expect(sql).toContain("'public-id-v3-n1'");
    expect(sql).toContain("format('%I.public_id_v3_write_gate', current_schema())");
    expect(sql).toContain("format('%I.public_id_v3_migrations', current_schema())");
    expect(sql).not.toContain("to_regclass('public_id_v3_write_gate')");
    expect(sql).not.toContain("to_regclass('public_id_v3_migrations')");
    expect(sql).not.toContain('DROP TABLE "public_id_v3_migrations"');
    expect(sql).not.toContain('DROP TABLE "public_id_v3_write_gate"');
    expect(sql).not.toContain('DROP FUNCTION "enforce_public_id_v3_write_gate"');
    expect(sql).not.toContain("DROP TRIGGER");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(
      "e8cc60047a84cc47ea9e7a85e2b121ae413c28c80011e17ae7d8f5175e74a7dd",
    );
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
