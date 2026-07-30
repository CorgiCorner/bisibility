import { randomUUID } from "node:crypto";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { publicIdContractEntities, publicIdFormatPattern } from "./definition";
import type { PublicIdV3N1WriteGateContext } from "./n1-write-gate";

const RELEASE_N_PHASE = "public-id-v3-n";
const RELEASE_N1_PHASE = "public-id-v3-n1";
const LOCAL_RELEASE = "0000000000000000000000000000000000000000";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function assertBackfillGate(
  db: PublicIdMigrationDatabase,
  context: PublicIdV3N1WriteGateContext,
) {
  const result = await db.query(
    `SELECT "phase",
            "releasePolicy",
            "targetAppRelease",
            "writesBlocked" AS "blocked",
            "releasedAt",
            "releasedAppRelease"
       FROM "public_id_v3_write_gate"
      WHERE "id" IS TRUE`,
  );
  const row = result.rows[0];
  if (
    result.rows.length === 1 &&
    row?.phase === RELEASE_N_PHASE &&
    row.releasePolicy === "automatic" &&
    row.targetAppRelease === LOCAL_RELEASE &&
    row.blocked === true &&
    row.releasedAt == null &&
    row.releasedAppRelease == null
  ) {
    return false;
  }
  if (
    result.rows.length !== 1 ||
    row?.phase !== RELEASE_N1_PHASE ||
    row.releasePolicy !== context.releasePolicy ||
    row.targetAppRelease !== context.targetAppRelease ||
    row.blocked !== true ||
    row.releasedAt != null ||
    row.releasedAppRelease != null
  ) {
    throw new Error("Post-release public ID ledger backfill requires the exact blocked N+1 gate.");
  }
  return true;
}

export async function backfillPostReleasePublicIdLedger(
  db: PublicIdMigrationDatabase,
  context: PublicIdV3N1WriteGateContext,
  batchSize = 500,
) {
  if (!(await assertBackfillGate(db, context))) return { eligible: false, reserved: 0 };

  let reserved = 0;
  for (const entity of publicIdContractEntities) {
    let cursor: string | null = null;
    while (true) {
      const batch = await db.query(
        `SELECT "row"."id", "row"."publicId"
           FROM "${entity.table}" AS "row"
           LEFT JOIN "public_id_v3_migrations" AS "migration"
             ON "migration"."entityType" = $1
            AND "migration"."internalId" = "row"."id"
          WHERE ($2::text IS NULL OR "row"."id" > $2)
            AND "migration"."internalId" IS NULL
            AND "row"."publicId" ~ $3
          ORDER BY "row"."id" ASC
          LIMIT $4`,
        [entity.entityType, cursor, publicIdFormatPattern(entity.prefix), batchSize],
      );
      if (batch.rows.length === 0) break;

      const rows = batch.rows.map((row) => {
        const id = stringValue(row.id);
        const publicId = stringValue(row.publicId);
        if (!id || !publicId) {
          throw new Error(`${entity.table} has an invalid post-release public ID row.`);
        }
        return { id, publicId };
      });

      await db.query("BEGIN");
      try {
        await db.query(
          `SELECT set_config(
             'bisibility.public_id_write_gate_bypass',
             'public-id-v3-n1',
             TRUE
           )`,
        );
        const inserted = await db.query(
          `INSERT INTO "public_id_v3_migrations"
             ("id", "entityType", "internalId", "oldExternalId",
              "newPublicId", "createdAt", "migratedAt")
           SELECT input."id", $1, input."internalId", NULL,
                  input."newPublicId", NOW(), NOW()
             FROM unnest($2::text[], $3::text[], $4::text[])
               AS input("id", "internalId", "newPublicId")
           ON CONFLICT DO NOTHING
           RETURNING "internalId", "newPublicId"`,
          [
            entity.entityType,
            rows.map(() => randomUUID()),
            rows.map((row) => row.id),
            rows.map((row) => row.publicId),
          ],
        );
        if (inserted.rows.length !== rows.length) {
          throw new Error(`Could not reserve post-release public IDs for ${entity.entityType}.`);
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }

      reserved += rows.length;
      cursor = rows.at(-1)?.id ?? null;
      if (rows.length < batchSize) break;
    }
  }
  return { eligible: true, reserved };
}
