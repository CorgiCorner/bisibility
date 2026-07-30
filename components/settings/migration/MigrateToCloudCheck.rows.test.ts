import { describe, expect, it } from "vitest";
import { resultRows } from "./MigrateToCloudCheck.rows";
import type { MigrationCompatibilityResult } from "./MigrateToCloudWizard.types";

function compatibility(
  overrides: Partial<MigrationCompatibilityResult["target"]> = {},
): MigrationCompatibilityResult {
  return {
    blockers: [],
    checkedAt: "2026-07-24T10:00:00.000Z",
    compatible: true,
    contextKey: "prj_abcdefghijklmnopqrstuvwx|to-cloud|https://target.example.com",
    source: {
      appVersion: "0.1.0",
      appVersionSource: "package.json",
      cloudOrigin: "https://bisibility.com",
      data: { keywords: 12, rankChecks: 34 },
      limits: { pushMaxKeywords: 50_000, sessionsRequired: false },
      schema: { count: 1, latest: "migration_1" },
    },
    target: {
      appVersion: "0.1.0",
      latestMigration: "migration_1",
      origin: "https://target.example.com",
      reachable: true,
      sameInstance: false,
      schemaVersionsSupported: [5],
      sourceDeploymentMode: "self-host",
      supportsSessions: true,
      ...overrides,
    },
  };
}

describe("migration compatibility rows", () => {
  it("renders the resolved destination origin and a chip-less transfer plan", () => {
    const rows = resultRows(compatibility());
    const destination = rows.find((row) => row.title === "Destination instance");
    const transferPlan = rows.find((row) => row.title === "Transfer plan");

    expect(destination?.detail).toBe("Reachable - bisibility 0.1.0 at https://target.example.com.");
    expect(transferPlan).toMatchObject({
      detail: "12 keywords and 34 rank checks will move in a single transfer.",
      variant: "detail",
    });
    expect(transferPlan).not.toHaveProperty("status");
  });

  it("includes the resolved address and deployment-mode guidance for MIG-105", () => {
    const result = compatibility({ sameInstance: true });
    result.blockers = [
      { code: "MIG-105", message: "The destination address points at this same instance." },
    ];
    result.compatible = false;

    const blocker = resultRows(result).find(
      (row) => row.variant === "status" && row.status === "MIG-105",
    );

    expect(blocker?.detail).toContain("https://target.example.com");
    expect(blocker?.detail).toContain("likely needs DEPLOYMENT_MODE set to cloud");
  });
});
