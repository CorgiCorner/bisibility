import { describe, expect, it } from "vitest";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { publicIdV3CutoverMetadata } from "@/lib/data-migrations/definitions/20260729213000_public_id_v3_cutover";
import { definition } from "./20260729213000_public_id_v3_cutover";
import { computeDataMigrationChecksum } from "./runner";
import { dataMigrationRegistry } from "./registry";

describe("data migration registry metadata", () => {
  it("retires the active v3 runner while preserving immutable audit metadata", async () => {
    const manifest = dataMigrationManifest[0];

    expect(dataMigrationRegistry).toEqual([]);
    expect(manifest).toMatchObject({
      ...publicIdV3CutoverMetadata,
      blocking: false,
      contractState: "enforced",
    });
    expect(definition).toMatchObject(publicIdV3CutoverMetadata);
    expect(definition.checksum).toBe(manifest.checksum);
    await expect(computeDataMigrationChecksum(definition)).resolves.toBe(
      "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
    );
    expect(definition.checksumInputs.map((input) => input.label)).toContain(
      "lib/data-migrations/definitions/20260729213000_public_id_v3_cutover.ts",
    );
  });
});
