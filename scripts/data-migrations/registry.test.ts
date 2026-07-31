import { describe, expect, it } from "vitest";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { publicIdV3CutoverMetadata } from "@/lib/data-migrations/definitions/20260729213000_public_id_v3_cutover";
import { definition } from "./20260729213000_public_id_v3_cutover";
import { activeDataMigrationImplementations } from "./registry";

describe("data migration registry metadata", () => {
  it("retires the active v3 runner while preserving immutable audit metadata", () => {
    const manifest = dataMigrationManifest[0];

    expect(activeDataMigrationImplementations).toEqual([]);
    expect(manifest).toMatchObject({
      contractMigrationId: publicIdV3CutoverMetadata.blocksSchemaMigration,
      execution: "deploy-blocking",
      id: publicIdV3CutoverMetadata.id,
      lifecycle: "retired",
      prerequisiteSchemaMigrationId: publicIdV3CutoverMetadata.requiresSchemaThrough,
    });
    expect(definition).toMatchObject(publicIdV3CutoverMetadata);
    expect(definition.checksum).toBe(manifest.checksum);
    expect(definition.checksumInputs.map((input) => input.label)).toContain(
      "lib/data-migrations/definitions/20260729213000_public_id_v3_cutover.ts",
    );
  });
});
