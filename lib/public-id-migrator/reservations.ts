import { randomUUID } from "node:crypto";
import { isExpectedPublicId, type PublicIdEntityDefinition } from "./entities.ts";
import type { PublicIdMigrationDatabase, PublicIdMigrationOptions } from "./types.ts";

export type EntityBatchRow = {
  id: string;
  ledgerPublicId: string | null;
  publicId: string | null;
};

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

export async function reserveStrictEntityIds(
  db: PublicIdMigrationDatabase,
  entity: PublicIdEntityDefinition,
  batchSize: number,
  dryRun: boolean,
) {
  let cursor: string | null = null;
  while (true) {
    const batch = await db.query(
      `SELECT "id", "publicId"
         FROM "${entity.table}"
        WHERE ($1::text IS NULL OR "id" > $1)
          AND "publicId" ~ $2
        ORDER BY "id" ASC
        LIMIT $3`,
      [cursor, `^${entity.prefix}_[a-z][a-z0-9]{23}$`, batchSize],
    );
    if (batch.rows.length === 0) return;
    await inBatchTransaction(db, dryRun, async () => {
      const rows = batch.rows.map((row) => {
        const id = stringValue(row.id);
        const publicId = stringValue(row.publicId);
        if (!id || !publicId) throw new Error(`${entity.table} has an invalid public ID row.`);
        return { id, publicId };
      });
      const reserved = await db.query(
        `INSERT INTO "public_id_v3_migrations"
           ("id", "entityType", "internalId", "oldExternalId",
            "newPublicId", "createdAt", "migratedAt")
         SELECT input."id", $1, input."internalId", NULL,
                input."newPublicId", NOW(), NOW()
           FROM unnest($2::text[], $3::text[], $4::text[])
             AS input("id", "internalId", "newPublicId")
         ON CONFLICT ("entityType", "internalId") DO UPDATE
           SET "migratedAt" = NOW()
         WHERE "public_id_v3_migrations"."newPublicId" = EXCLUDED."newPublicId"
         RETURNING "internalId", "newPublicId"`,
        [
          entity.entityType,
          rows.map(() => randomUUID()),
          rows.map((row) => row.id),
          rows.map((row) => row.publicId),
        ],
      );
      if (reserved.rows.length !== rows.length) {
        throw new Error(`Could not reserve strict public IDs for ${entity.entityType}.`);
      }
      const expected = new Map(rows.map((row) => [row.id, row.publicId]));
      for (const row of reserved.rows) {
        const internalId = stringValue(row.internalId);
        const publicId = stringValue(row.newPublicId);
        if (!internalId || expected.get(internalId) !== publicId) {
          throw new Error(`Strict public ID ledger mismatch for ${entity.entityType}.`);
        }
      }
    });
    cursor = stringValue(batch.rows.at(-1)?.id);
    if (batch.rows.length < batchSize) return;
  }
}

export async function ensureBatchReservations(
  db: PublicIdMigrationDatabase,
  entity: PublicIdEntityDefinition,
  rows: readonly EntityBatchRow[],
  makeId: NonNullable<PublicIdMigrationOptions["makeId"]>,
) {
  const pending = new Map(
    rows.filter((row) => !row.ledgerPublicId).map((row) => [row.id, row] as const),
  );
  let created = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (pending.size === 0) break;
    const candidates = [...pending.values()].map((row) => ({
      id: randomUUID(),
      internalId: row.id,
      newPublicId: isExpectedPublicId(entity, row.publicId)
        ? (row.publicId as string)
        : makeId(entity.prefix),
      oldExternalId: isExpectedPublicId(entity, row.publicId) ? null : row.publicId,
    }));
    const inserted = await db.query(
      `INSERT INTO "public_id_v3_migrations"
         ("id", "entityType", "internalId", "oldExternalId", "newPublicId", "createdAt")
       SELECT input."id", $1, input."internalId", input."oldExternalId",
              input."newPublicId", NOW()
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[])
           AS input("id", "internalId", "oldExternalId", "newPublicId")
       ON CONFLICT DO NOTHING
       RETURNING "internalId"`,
      [
        entity.entityType,
        candidates.map((candidate) => candidate.id),
        candidates.map((candidate) => candidate.internalId),
        candidates.map((candidate) => candidate.oldExternalId),
        candidates.map((candidate) => candidate.newPublicId),
      ],
    );
    created += inserted.rows.length;
    const reserved = await db.query(
      `SELECT "internalId", "oldExternalId", "newPublicId"
         FROM "public_id_v3_migrations"
        WHERE "entityType" = $1
          AND "internalId" = ANY($2::text[])`,
      [entity.entityType, [...pending.keys()]],
    );
    for (const ledgerRow of reserved.rows) {
      const internalId = stringValue(ledgerRow.internalId);
      if (!internalId) continue;
      const source = pending.get(internalId);
      if (!source) continue;
      const publicId = stringValue(ledgerRow.newPublicId);
      const oldExternalId = stringValue(ledgerRow.oldExternalId);
      if (!publicId || !isExpectedPublicId(entity, publicId)) {
        throw new Error(`Ledger mismatch for ${entity.entityType}:${internalId}.`);
      }
      if (isExpectedPublicId(entity, source.publicId)) {
        if (publicId !== source.publicId || oldExternalId !== null) {
          throw new Error(`Ledger mismatch for ${entity.entityType}:${internalId}.`);
        }
      } else if (oldExternalId !== source.publicId) {
        throw new Error(`Ledger mismatch for ${entity.entityType}:${internalId}.`);
      }
      pending.delete(internalId);
    }
  }
  if (pending.size > 0) {
    throw new Error(`Could not reserve public IDs for ${entity.entityType}.`);
  }
  return created;
}
