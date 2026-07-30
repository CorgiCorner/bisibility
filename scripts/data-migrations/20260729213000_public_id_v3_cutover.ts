import { publicIdV3CutoverMetadata } from "@/lib/data-migrations/definitions/20260729213000_public_id_v3_cutover";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { runPublicIdContractPrepare } from "@/lib/public-id-contract/upgrade";
import {
  publicIdV3WriteGateContext,
  readPublicIdV3WriteGate,
  releasePublicIdV3WriteGate,
} from "@/lib/public-id-contract/write-gate";
import type { DataMigrationContext, DataMigrationDefinition } from "./types";

export async function run({ batchSize, db, log }: DataMigrationContext) {
  const context = publicIdV3WriteGateContext();
  if (context.phase !== publicIdV3CutoverMetadata.writeGatePhase) {
    throw new Error("Public ID v3 cutover write gate phase is inconsistent.");
  }
  const result = await runPublicIdContractPrepare(db, { batchSize });
  const preparedGate = await readPublicIdV3WriteGate(db);
  if (
    !preparedGate.installed ||
    !preparedGate.blocked ||
    preparedGate.phase !== context.phase ||
    preparedGate.releasePolicy !== context.releasePolicy ||
    preparedGate.targetAppRelease !== context.targetAppRelease
  ) {
    throw new Error("Public ID v3 write gate does not match the cutover deployment.");
  }
  log(
    `public ID v3 cutover: migrated=${result.migration.migrated} reservations=${result.migration.reservations} rewritten=${result.migration.rewritten} revokedCredentials=${result.migration.revokedCredentials} writeGate=blocked`,
  );
}

export async function afterFinish({ db, log }: Pick<DataMigrationContext, "db" | "log">) {
  const context = publicIdV3WriteGateContext();
  if (context.phase !== publicIdV3CutoverMetadata.writeGatePhase) {
    throw new Error("Public ID v3 cutover write gate phase is inconsistent.");
  }
  const gate = await readPublicIdV3WriteGate(db);
  if (
    !gate.installed ||
    gate.phase !== context.phase ||
    gate.releasePolicy !== context.releasePolicy
  ) {
    throw new Error("Public ID v3 write gate does not match the finished cutover.");
  }
  if (gate.blocked) {
    if (gate.targetAppRelease !== context.targetAppRelease) {
      throw new Error("Public ID v3 write gate targets a different application release.");
    }
    if (context.releasePolicy === "automatic") {
      await releasePublicIdV3WriteGate(db, context);
      log("public ID v3 write gate: released automatically");
    }
    return;
  }
  if (gate.releasedAppRelease !== gate.targetAppRelease) {
    throw new Error("Released public ID v3 write gate is inconsistent.");
  }
}

const metadata = dataMigrationManifest.find(
  (migration) => migration.id === publicIdV3CutoverMetadata.id,
);

if (!metadata) {
  throw new Error("Public ID v3 data migration metadata is missing.");
}

export const definition = {
  ...publicIdV3CutoverMetadata,
  afterFinish,
  checksum: metadata.checksum,
  checksumInputs: [
    {
      label: "scripts/data-migrations/20260729213000_public_id_v3_cutover.ts",
      url: new URL(import.meta.url),
    },
    {
      label: "lib/data-migrations/definitions/20260729213000_public_id_v3_cutover.ts",
      url: new URL(
        "../../lib/data-migrations/definitions/20260729213000_public_id_v3_cutover.ts",
        import.meta.url,
      ),
    },
    {
      label: "lib/public-id-contract/upgrade.ts",
      url: new URL("../../lib/public-id-contract/upgrade.ts", import.meta.url),
    },
    {
      label: "lib/public-id-contract/prepare.ts",
      url: new URL("../../lib/public-id-contract/prepare.ts", import.meta.url),
    },
    {
      label: "lib/public-id-contract/write-gate.ts",
      url: new URL("../../lib/public-id-contract/write-gate.ts", import.meta.url),
    },
    {
      label: "lib/public-id-contract/definition.ts",
      url: new URL("../../lib/public-id-contract/definition.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/runner.ts",
      url: new URL("../../lib/public-id-migrator/runner.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/reservations.ts",
      url: new URL("../../lib/public-id-migrator/reservations.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/status.ts",
      url: new URL("../../lib/public-id-migrator/status.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/entities.ts",
      url: new URL("../../lib/public-id-migrator/entities.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/denormalized.ts",
      url: new URL("../../lib/public-id-migrator/denormalized.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/rewrite-maps.ts",
      url: new URL("../../lib/public-id-migrator/rewrite-maps.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/json-rewrite.ts",
      url: new URL("../../lib/public-id-migrator/json-rewrite.ts", import.meta.url),
    },
    {
      label: "lib/public-id-migrator/types.ts",
      url: new URL("../../lib/public-id-migrator/types.ts", import.meta.url),
    },
    {
      label: "lib/db/public-id.ts",
      url: new URL("../../lib/db/public-id.ts", import.meta.url),
    },
  ],
  run,
  sourceUrl: new URL(import.meta.url),
} as const satisfies DataMigrationDefinition;
