import { expect, it, vi } from "vitest";
import { readyDataMigrations } from "./prerequisites";
import type { ResolvedDataMigration } from "./types";

function migration(id: string, prerequisiteSchemaMigrationId: string): ResolvedDataMigration {
  return {
    id, prerequisiteSchemaMigrationId, checksum: "a".repeat(64),
    contractMigrationId: "contract", execution: "deploy-blocking", lifecycle: "active",
    checksumInputs: [], sourceUrl: new URL(import.meta.url), run: async () => undefined,
  };
}

it("selects only actual successful Prisma prerequisites, retaining the original migration identity", async () => {
  const query = vi.fn(async (_sql: string) => ({ rows: [{ migration_name: "old_schema" }] }));
  const old = migration("old", "old_schema");
  const later = migration("later", "later_schema");
  expect(await readyDataMigrations({ query }, [old, later], true)).toEqual([old]);
  expect(query.mock.calls[0][0]).toContain("finished_at IS NOT NULL");
  expect(query.mock.calls[0][0]).toContain("rolled_back_at IS NULL");
});

it("the direct data command refuses an unmet prerequisite instead of claiming completion", async () => {
  const query = async () => ({ rows: [] });
  await expect(readyDataMigrations({ query }, [migration("later", "later_schema")], false))
    .rejects.toThrow("prerequisite is not applied: later_schema");
});
