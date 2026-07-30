import { describe, expect, it } from "vitest";
import {
  dataMigrationBatchSize,
  dataMigrationLockTimeoutMs,
  migrationDatabaseUrl,
} from "./run";

describe("data migration CLI configuration", () => {
  it("prefers DIRECT_URL and requires a database URL", () => {
    expect(
      migrationDatabaseUrl({
        DATABASE_URL: "postgresql://example.com/database",
        DIRECT_URL: "postgresql://example.com/direct",
      }),
    ).toBe("postgresql://example.com/direct");
    expect(() => migrationDatabaseUrl({})).toThrow("DIRECT_URL or DATABASE_URL");
  });

  it("bounds batch size", () => {
    expect(dataMigrationBatchSize(undefined)).toBe(200);
    expect(dataMigrationBatchSize("1000")).toBe(1_000);
    for (const value of ["0", "1001", "1.5", "invalid"]) {
      expect(() => dataMigrationBatchSize(value)).toThrow("between 1 and 1000");
    }
  });

  it("uses a 120 second lock wait and bounds operator overrides", () => {
    expect(dataMigrationLockTimeoutMs(undefined)).toBe(120_000);
    expect(dataMigrationLockTimeoutMs("1")).toBe(1_000);
    expect(dataMigrationLockTimeoutMs("600")).toBe(600_000);
    for (const value of ["0", "601", "1.5", "invalid"]) {
      expect(() => dataMigrationLockTimeoutMs(value)).toThrow("between 1 and 600");
    }
  });
});
