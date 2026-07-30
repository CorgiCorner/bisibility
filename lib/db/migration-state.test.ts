import { describe, expect, it } from "vitest";
import { compareMigrationState } from "./migration-state";

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
