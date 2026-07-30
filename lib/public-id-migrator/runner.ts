import { makePublicId } from "@/lib/db/public-id";
import { rewriteDenormalizedIds } from "./denormalized.ts";
import {
  isExpectedPublicId,
  type PublicIdEntityDefinition,
  publicIdEntityDefinitions,
} from "./entities.ts";
import {
  type EntityBatchRow,
  ensureBatchReservations,
  reserveStrictEntityIds,
} from "./reservations.ts";
import type {
  PublicIdMigrationDatabase,
  PublicIdMigrationOptions,
  PublicIdMigrationResult,
} from "./types.ts";

export { publicIdMigrationStatus } from "./status.ts";
export type {
  PublicIdMigrationDatabase,
  PublicIdMigrationOptions,
  PublicIdMigrationResult,
} from "./types.ts";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function inBatchTransaction<T>(
  db: PublicIdMigrationDatabase,
  dryRun: boolean,
  work: () => Promise<T>,
) {
  if (dryRun) return work();
  await db.query("BEGIN");
  try {
    const result = await work();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function migrateEntity(
  db: PublicIdMigrationDatabase,
  entity: PublicIdEntityDefinition,
  options: Required<Pick<PublicIdMigrationOptions, "batchSize" | "dryRun" | "makeId">> &
    Pick<PublicIdMigrationOptions, "stopAfter">,
  result: PublicIdMigrationResult,
) {
  let cursor: string | null = null;
  while (true) {
    const batch = await db.query(
      `SELECT "row"."id",
              "row"."publicId",
              "migration"."newPublicId" AS "ledgerPublicId"
         FROM "${entity.table}" AS "row"
         LEFT JOIN "public_id_v3_migrations" AS "migration"
           ON "migration"."entityType" = $1
          AND "migration"."internalId" = "row"."id"
        WHERE ($2::text IS NULL OR "row"."id" > $2)
          AND (
            "migration"."id" IS NULL
            OR "migration"."migratedAt" IS NULL
            OR "migration"."newPublicId" IS DISTINCT FROM "row"."publicId"
          )
        ORDER BY "row"."id" ASC
        LIMIT $3`,
      [entity.entityType, cursor, options.batchSize],
    );
    if (batch.rows.length === 0) return;
    await inBatchTransaction(db, options.dryRun, async () => {
      const rows = batch.rows.map((row): EntityBatchRow => {
        const id = stringValue(row.id);
        if (!id) throw new Error(`${entity.table} has a non-string primary key.`);
        return {
          id,
          ledgerPublicId: stringValue(row.ledgerPublicId),
          publicId: stringValue(row.publicId),
        };
      });
      result.scanned += rows.length;
      result.reservations += await ensureBatchReservations(db, entity, rows, options.makeId);
      const ids = rows.map((row) => row.id);
      const updated = await db.query(
        `UPDATE "${entity.table}" AS "row"
            SET "publicId" = "migration"."newPublicId"${
              entity.entityType === "project"
                ? `,
                "isSample" = "row"."isSample"
                  OR "row"."publicId" ~ '^prj_sample_[0-9A-Za-z]{10}$'`
                : ""
            }
           FROM "public_id_v3_migrations" AS "migration"
          WHERE "migration"."entityType" = $1
            AND "migration"."internalId" = "row"."id"
            AND "row"."id" = ANY($2::text[])
            AND "row"."publicId" IS DISTINCT FROM "migration"."newPublicId"
          RETURNING "row"."id"`,
        [entity.entityType, ids],
      );
      result.migrated += updated.rows.length;
      const marked = await db.query(
        `UPDATE "public_id_v3_migrations"
            SET "migratedAt" = NOW()
          WHERE "entityType" = $1
            AND "internalId" = ANY($2::text[])
            AND "migratedAt" IS NULL
          RETURNING "internalId"`,
        [entity.entityType, ids],
      );
      const ledger = await db.query(
        `SELECT "internalId", "newPublicId"
           FROM "public_id_v3_migrations"
          WHERE "entityType" = $1
            AND "internalId" = ANY($2::text[])`,
        [entity.entityType, ids],
      );
      if (ledger.rows.length !== rows.length) {
        throw new Error(`Public ID ledger is incomplete for ${entity.entityType}.`);
      }
      for (const row of ledger.rows) {
        const publicId = stringValue(row.newPublicId);
        if (!publicId || !isExpectedPublicId(entity, publicId)) {
          throw new Error(`Public ID ledger is invalid for ${entity.entityType}.`);
        }
      }
      if (marked.rows.length > rows.length) {
        throw new Error(`Public ID ledger update overflow for ${entity.entityType}.`);
      }
      if (options.stopAfter && result.scanned >= options.stopAfter) {
        throw new Error("Public ID migration interrupted for resume testing.");
      }
    });
    cursor = stringValue(batch.rows.at(-1)?.id);
    if (batch.rows.length < options.batchSize) return;
  }
}

async function revokeLegacyCredentials(db: PublicIdMigrationDatabase) {
  const apiKeys = await db.query(
    `UPDATE "api_keys"
        SET "revokedAt" = NOW()
      WHERE "revokedAt" IS NULL
        AND "prefix" NOT LIKE 'bsb_key_live_%'
        AND "prefix" NOT LIKE 'bsb_key_test_%'
      RETURNING "id"`,
  );
  const personalTokens = await db.query(
    `UPDATE "personal_access_tokens"
        SET "revokedAt" = NOW()
      WHERE "revokedAt" IS NULL
        AND "prefix" NOT LIKE 'bsb_pat_live_%'
      RETURNING "id"`,
  );
  return (
    (apiKeys.rowCount ?? apiKeys.rows.length) +
    (personalTokens.rowCount ?? personalTokens.rows.length)
  );
}

export async function migratePublicIds(
  db: PublicIdMigrationDatabase,
  input: PublicIdMigrationOptions,
) {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 1_000) {
    throw new Error("batchSize must be between 1 and 1000.");
  }
  const options = {
    batchSize: input.batchSize,
    dryRun: input.dryRun ?? false,
    makeId: input.makeId ?? makePublicId,
    stopAfter: input.stopAfter,
  };
  const result: PublicIdMigrationResult = {
    migrated: 0,
    reservations: 0,
    revokedCredentials: 0,
    rewritten: 0,
    scanned: 0,
  };
  let dryRunTransactionOpen = false;
  let lockAcquired = false;
  const lock = await db.query(
    `SELECT pg_try_advisory_lock(
       hashtext('bisibility-public-id-v3-migration:' || current_schema())
     ) AS "locked"`,
  );
  if (lock.rows[0]?.locked !== true) {
    throw new Error("Another public ID v3 migration is already running.");
  }
  lockAcquired = true;
  try {
    if (options.dryRun) {
      await db.query("BEGIN");
      dryRunTransactionOpen = true;
    }
    for (const entity of publicIdEntityDefinitions) {
      await reserveStrictEntityIds(db, entity, options.batchSize, options.dryRun);
    }
    for (const entity of publicIdEntityDefinitions)
      await migrateEntity(db, entity, options, result);
    await rewriteDenormalizedIds(db, options, result);
    if (!options.dryRun) {
      result.revokedCredentials = await revokeLegacyCredentials(db);
    }
    if (dryRunTransactionOpen) {
      await db.query("ROLLBACK");
      dryRunTransactionOpen = false;
    }
    return result;
  } catch (error) {
    if (dryRunTransactionOpen) await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (lockAcquired) {
      await db.query(
        `SELECT pg_advisory_unlock(
           hashtext('bisibility-public-id-v3-migration:' || current_schema())
         )`,
      );
    }
  }
}
