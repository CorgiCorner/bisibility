import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectionFingerprint } from "@/lib/observation/projection-fingerprint";
export const replayDigest = projectionFingerprint;
export const rawTextHash = (value: string | null) =>
  createHash("sha256")
    .update(value ?? "#SQL_NULL#")
    .digest("hex");
/** Maintained source bytes, not a caller's asserted version string. */
export async function replayCodeHash(root = process.cwd()) {
  const files = [
    ...[
      "model",
      "schema",
      "hash",
      "access",
      "source-query",
      "evaluate",
      "retained",
      "repository",
      "service",
      "stop",
      "cli-options",
      "rematch",
      "rematch-source",
    ].map((name) => `lib/evidence-replay/${name}.ts`),
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "lib/db/pool-config.ts",
    "lib/db/schema-config.mjs",
    "lib/observation/projection-fingerprint.ts",
    "scripts/ops/backfill-competitor-organics.ts",
    "lib/rank-check/organic-ranks.ts",
    "lib/domains/normalize.ts",
    "lib/observation/persist-definition.ts",
    "lib/measurement-definitions/canonical.ts",
    "lib/measurement-definitions/storage.ts",
    "lib/measurement-definitions/schema.ts",
    "lib/business-location-store/mutation.ts",
    "lib/business-location-store/match-write.ts",
    "lib/business-location-store/match-repository.ts",
    "lib/business-location-store/observation-read.ts",
    "lib/local-monitor-results/binding.ts",
    "lib/local-monitor-results/evidence.ts",
    "lib/local-monitoring-store/custody.ts",
    "lib/business-location-store/access.ts",
    "lib/business-location-store/canonical.ts",
    "lib/business-location-store/schema.ts",
    "lib/business-location-store/location-repository.ts",
    "lib/business-locations/dto.ts",
    "lib/business-locations/schema.ts",
    "lib/business-locations/identity-normalization.ts",
    "lib/business-locations/identity-revisions.ts",
    "lib/business-locations/match-evidence.ts",
    "lib/local-monitor-results/source-definition.ts",
    "lib/local-monitoring-store/occurrence-definition.ts",
    "lib/local-monitoring-store/unknown-observation-time.ts",
    "lib/business-locations/match.ts",
    "lib/business-locations/match-decisions.ts",
    "prisma/schema/evidence-replay.prisma",
    "prisma/migrations/20261013044000_history_evidence_replay/migration.sql",
  ];
  const values = await Promise.all(
    files.map(async (path) => [path, rawTextHash(await readFile(resolve(root, path), "utf8"))]),
  );
  return replayDigest(values);
}
