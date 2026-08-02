import { describe, expect, it } from "vitest";
import { compareMigrationState, latestAppliedMigrationName } from "./migration-state";

describe("latestAppliedMigrationName", () => {
  it("uses migration-name order when an older migration finishes later", () => {
    expect(
      latestAppliedMigrationName([
        { migration_name: "20260730204300_rank_check_normalization_backfill" },
        { migration_name: "20260730073000_data_migration_finalization" },
      ]),
    ).toBe("20260730204300_rank_check_normalization_backfill");
  });

  it("returns null when no migration has finished", () => {
    expect(latestAppliedMigrationName([])).toBeNull();
  });
});

describe("compareMigrationState", () => {
  it.each([
    {
      applied: "20260724220000_instance_settings",
      bundled: "20260724220000_instance_settings",
      expected: "ok",
    },
    {
      applied: "20260725010000_newer_database",
      bundled: "20260724220000_worker_bundle",
      expected: "worker-behind",
    },
    {
      applied: "20260724220000_database",
      bundled: "20260725010000_newer_worker",
      expected: "worker-ahead",
    },
    { applied: null, bundled: "20260724220000_worker_bundle", expected: "unknown" },
    { applied: "20260724220000_database", bundled: null, expected: "unknown" },
    { applied: null, bundled: null, expected: "unknown" },
  ] as const)("returns $expected for applied=$applied and bundled=$bundled", (input) => {
    expect(compareMigrationState(input)).toBe(input.expected);
  });
});
