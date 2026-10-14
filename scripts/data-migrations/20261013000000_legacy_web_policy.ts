import { randomUUID } from "node:crypto";
import { makePublicId, requirePublicId } from "@/lib/db/public-id";
import type { PersistedDefinitionPolicy } from "@/lib/measurement-definitions/model";
import type { DataMigrationContext, DataMigrationImplementation } from "./types";

const id = "20261013000000_legacy_web_policy";
const sourceUrl = new URL(import.meta.url);

/** Immutable release conversion, verified against the real native host manifest by a contract test.
 * Future adapter changes require a new migration. Neither duration invents an operator freshness SLO. */
export const legacyWebPolicy = {
  version: 1,
  definitionVersion: "web-organic-v1",
  forcedAiOverview: false,
  adapters: [
    {
      providerId: "dataforseo",
      capabilityVersion: "web-serp-v1",
      adapterVersion: "dataforseo-observation-v1",
      nativeFindTargetsIn: "with_subdomains_on_match",
    },
    {
      providerId: "serpapi",
      capabilityVersion: "web-serp-v1",
      adapterVersion: "serpapi-observation-v1",
      nativeFindTargetsIn: "none",
    },
  ],
  freshness: {
    configurationRevision: "host-own-calendar-v1",
    manualTtlMs: null,
    cadenceGraceMs: null,
  },
} satisfies PersistedDefinitionPolicy;

async function run({ db, batchSize, log }: DataMigrationContext) {
  for (;;) {
    await db.query("BEGIN");
    try {
      // The maintained runner retains its original startedAt across interrupted replay.
      // Later projects stay unconfigured; a read never executes this conversion.
      const page = await db.query(
        `
        SELECT p.id,p."publicId",p."measurementPolicyEpoch"::text AS epoch
        FROM projects p JOIN data_migrations m ON m.id=$1
        WHERE p."createdAt"<=m."startedAt" AND p."measurementPolicyConfig" IS NULL
        ORDER BY p.id LIMIT $2 FOR UPDATE OF p`,
        [id, batchSize],
      );
      const marker = await db.query('SELECT "startedAt" FROM data_migrations WHERE id=$1', [
        id,
      ]);
      if (marker.rows.length !== 1)
        throw new Error("Legacy policy conversion requires the maintained migration runner.");
      for (const row of page.rows) {
        if (typeof row.id !== "string" || typeof row.epoch !== "string")
          throw new Error("Invalid legacy project policy source.");
        const projectPublicId = requirePublicId(row.publicId, "prj");
        const updated = await db.query(
          `UPDATE projects SET "measurementPolicyConfig"=$2::jsonb
          WHERE id=$1 AND "measurementPolicyConfig" IS NULL RETURNING "measurementPolicyEpoch"::text AS epoch`,
          [row.id, JSON.stringify(legacyWebPolicy)],
        );
        if (updated.rows.length !== 1)
          throw new Error("Legacy project policy changed during conversion.");
        await db.query(
          `INSERT INTO audit_logs
          (id,"publicId","actorId","projectId",action,"targetType","targetId","after")
          VALUES ($1,$2,NULL,$3,'measurement_definition.configure','project_defaults',$4,$5::jsonb)`,
          [
            randomUUID(),
            makePublicId("audit"),
            row.id,
            projectPublicId,
            JSON.stringify({
              operation: "migration",
              revisionId: updated.rows[0].epoch,
              previousRevisionId: row.epoch,
              migrationId: id,
            }),
          ],
        );
      }
      await db.query("COMMIT");
      log(`data migration ${id}: processed=${page.rows.length}`);
      if (page.rows.length < batchSize) return;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

export const legacyWebPolicyMigration = {
  id,
  sourceUrl,
  replaySafe: true,
  run,
  checksumInputs: [
    { label: "migration", url: sourceUrl },
    { label: "lib/db/public-id.ts", url: new URL("../../lib/db/public-id.ts", sourceUrl) },
  ],
} satisfies DataMigrationImplementation;
