import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { describe, expect, it } from "vitest";
import { activeDataMigrationImplementations } from "./registry";
import { resolveActiveDataMigrations } from "./resolver";

describe("data migration registry metadata", () => {
  it("registers the active implementation and resolves its checksum", async () => {
    expect(activeDataMigrationImplementations.map((entry) => entry.id)).toEqual([
      "20260902033000_keyword_schedules_to_check_schedules",
      "20260904210000_run_start_semantics",
      "20261011021000_accounting_history",
      "20261013000000_legacy_web_policy",
    ]);
    expect(dataMigrationManifest).toEqual([
      expect.objectContaining({
        contractMigrationId: "20261001010000_drop_keyword_schedules",
        execution: "deploy-blocking",
        id: "20260902033000_keyword_schedules_to_check_schedules",
        lifecycle: "active",
        prerequisiteSchemaMigrationId: "20260902030000_rank_check_runs",
      }),
      expect.objectContaining({
        execution: "deploy-blocking",
        id: "20260904210000_run_start_semantics",
        lifecycle: "active",
        prerequisiteSchemaMigrationId: "20260902030000_rank_check_runs",
      }),
      expect.objectContaining({
        execution: "deploy-blocking",
        id: "20261011021000_accounting_history",
        lifecycle: "active",
        prerequisiteSchemaMigrationId: "20261011020000_accounting_history_snapshot",
      }),
      expect.objectContaining({
        execution: "deploy-blocking",
        id: "20261013000000_legacy_web_policy",
        lifecycle: "active",
        prerequisiteSchemaMigrationId: "20261012200600_measurement_definition_authority",
      }),
    ]);
    await expect(
      resolveActiveDataMigrations(dataMigrationManifest, activeDataMigrationImplementations),
    ).resolves.toEqual([
      expect.objectContaining({
        checksum: dataMigrationManifest[0]?.checksum,
        id: "20260902033000_keyword_schedules_to_check_schedules",
      }),
      expect.objectContaining({
        checksum: dataMigrationManifest[1]?.checksum,
        id: "20260904210000_run_start_semantics",
      }),
      expect.objectContaining({ id: "20261011021000_accounting_history", replaySafe: true }),
      expect.objectContaining({ id: "20261013000000_legacy_web_policy", replaySafe: true }),
    ]);
  });
});
