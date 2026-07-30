import { publicIdMigrationStatus } from "@/lib/public-id-migrator/status";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import {
  highVolumePublicIdTables,
  publicIdContractEntities,
  publicIdFormatConstraintName,
  publicIdFormatPattern,
  publicIdIndexName,
  publicIdNotNullConstraintName,
} from "./definition";

type IndexState = {
  accessMethod: string;
  attributeCount: number;
  expressionFree: boolean;
  keyAttributeCount: number;
  keyColumns: string[];
  predicateFree: boolean;
  table: string;
  unique: boolean;
  valid: boolean;
} | null;
type ConstraintState = {
  definition: string;
  table: string;
  type: string;
  validated: boolean;
} | null;

const PUBLIC_ID_PREPARE_LOCK_TIMEOUT = "5s";

function quotedIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

async function readLockTimeout(db: PublicIdMigrationDatabase) {
  const result = await db.query("SHOW lock_timeout");
  const lockTimeout = result.rows[0]?.lock_timeout;
  if (typeof lockTimeout !== "string" || lockTimeout.length === 0) {
    throw new Error("Could not read the current PostgreSQL lock_timeout.");
  }
  return lockTimeout;
}

async function setLockTimeout(db: PublicIdMigrationDatabase, lockTimeout: string) {
  await db.query(`SELECT set_config('lock_timeout', $1, false)`, [lockTimeout]);
}

async function countLedgerMismatches(
  db: PublicIdMigrationDatabase,
  entityType: string,
  table: string,
) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS "count"
       FROM "public_id_v3_migrations" AS "migration"
       JOIN ${quotedIdentifier(table)} AS "row"
         ON "row"."id" = "migration"."internalId"
      WHERE "migration"."entityType" = $1
        AND "migration"."newPublicId" IS DISTINCT FROM "row"."publicId"`,
    [entityType],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countIncompleteLedgerEntries(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS "count"
       FROM "public_id_v3_migrations"
      WHERE "migratedAt" IS NULL`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function readIndexState(db: PublicIdMigrationDatabase, name: string): Promise<IndexState> {
  const result = await db.query(
    `SELECT index_meta.indisunique AS "unique",
            index_meta.indisvalid AS "valid",
            access_method.amname AS "accessMethod",
            index_meta.indpred IS NULL AS "predicateFree",
            index_meta.indexprs IS NULL AS "expressionFree",
            index_meta.indnkeyatts::int AS "keyAttributeCount",
            index_meta.indnatts::int AS "attributeCount",
            table_meta.relname AS "table",
            ARRAY(
              SELECT attribute_meta.attname
                FROM unnest(index_meta.indkey) WITH ORDINALITY
                  AS key_meta(attnum, ordinality)
                JOIN pg_catalog.pg_attribute AS attribute_meta
                  ON attribute_meta.attrelid = index_meta.indrelid
                 AND attribute_meta.attnum = key_meta.attnum
               WHERE key_meta.ordinality <= index_meta.indnkeyatts
               ORDER BY key_meta.ordinality
            )::text[] AS "keyColumns"
       FROM pg_catalog.pg_index AS index_meta
       JOIN pg_catalog.pg_class AS class_meta ON class_meta.oid = index_meta.indexrelid
       JOIN pg_catalog.pg_class AS table_meta ON table_meta.oid = index_meta.indrelid
       JOIN pg_catalog.pg_am AS access_method ON access_method.oid = class_meta.relam
      WHERE class_meta.oid = to_regclass($1)`,
    [quotedIdentifier(name)],
  );
  const row = result.rows[0];
  return row
    ? {
        accessMethod: String(row.accessMethod),
        attributeCount: Number(row.attributeCount),
        expressionFree: row.expressionFree === true,
        keyAttributeCount: Number(row.keyAttributeCount),
        keyColumns: Array.isArray(row.keyColumns) ? row.keyColumns.map(String) : [],
        predicateFree: row.predicateFree === true,
        table: String(row.table),
        unique: row.unique === true,
        valid: row.valid === true,
      }
    : null;
}

async function readConstraintState(
  db: PublicIdMigrationDatabase,
  table: string,
  name: string,
): Promise<ConstraintState> {
  const result = await db.query(
    `SELECT constraint_meta.contype AS "type",
            constraint_meta.convalidated AS "validated",
            table_meta.relname AS "table",
            pg_catalog.pg_get_constraintdef(constraint_meta.oid, false) AS "definition"
       FROM pg_catalog.pg_constraint AS constraint_meta
       JOIN pg_catalog.pg_class AS table_meta ON table_meta.oid = constraint_meta.conrelid
      WHERE constraint_meta.conname = $1
        AND constraint_meta.conrelid = to_regclass($2)`,
    [name, quotedIdentifier(table)],
  );
  const row = result.rows[0];
  return row
    ? {
        definition: String(row.definition),
        table: String(row.table),
        type: String(row.type),
        validated: row.validated === true,
      }
    : null;
}

function hasExpectedIndexDefinition(state: Exclude<IndexState, null>, table: string) {
  return (
    state.unique &&
    state.accessMethod === "btree" &&
    state.table === table &&
    state.predicateFree &&
    state.expressionFree &&
    state.keyAttributeCount === 1 &&
    state.attributeCount === 1 &&
    state.keyColumns.length === 1 &&
    state.keyColumns[0] === "publicId"
  );
}

function hasExpectedNotNullConstraintDefinition(
  state: Exclude<ConstraintState, null>,
  table: string,
) {
  const definition = state.definition.replace(/\s+/g, " ").trim();
  return (
    state.type === "c" &&
    state.table === table &&
    /^CHECK \(\(?"publicId" IS NOT NULL\)\)?\)$/.test(definition)
  );
}

function hasExpectedFormatConstraintDefinition(
  state: Exclude<ConstraintState, null>,
  table: string,
  prefix: string,
) {
  const definition = state.definition.replace(/\s+/g, " ").trim();
  const expected = `CHECK (("publicId" ~ '${publicIdFormatPattern(prefix)}'::text))`;
  return state.type === "c" && state.table === table && definition === expected;
}

export async function assertPublicIdContractPreconditions(db: PublicIdMigrationDatabase) {
  const status = await publicIdMigrationStatus(db);
  const incomplete = status.filter(
    (row) => row.missing !== 0 || row.invalid !== 0 || row.strict !== row.total,
  );
  if (incomplete.length > 0) {
    throw new Error(
      `Public ID contract prerequisites are incomplete for: ${incomplete
        .map((row) => row.entityType)
        .join(", ")}.`,
    );
  }
  const incompleteLedgerEntries = await countIncompleteLedgerEntries(db);
  if (incompleteLedgerEntries !== 0) {
    throw new Error(`Public ID ledger has ${incompleteLedgerEntries} incomplete entries.`);
  }
  for (const entity of publicIdContractEntities) {
    const mismatches = await countLedgerMismatches(db, entity.entityType, entity.table);
    if (mismatches !== 0) {
      throw new Error(`Public ID ledger mismatch for ${entity.entityType}: ${mismatches} rows.`);
    }
  }
  return status;
}

export async function ensureHighVolumePublicIdIndexes(db: PublicIdMigrationDatabase) {
  for (const table of highVolumePublicIdTables) {
    const index = publicIdIndexName(table);
    const current = await readIndexState(db, index);
    if (current?.valid && hasExpectedIndexDefinition(current, table)) continue;
    if (current?.valid) {
      throw new Error(`Public ID index has an unexpected valid definition: ${index}.`);
    }
    if (current) await db.query(`DROP INDEX CONCURRENTLY ${quotedIdentifier(index)}`);
    await db.query(
      `CREATE UNIQUE INDEX CONCURRENTLY ${quotedIdentifier(index)}
         ON ${quotedIdentifier(table)} ("publicId")`,
    );
  }
}

export async function ensurePublicIdNotNullChecks(db: PublicIdMigrationDatabase) {
  for (const entity of publicIdContractEntities) {
    const constraint = publicIdNotNullConstraintName(entity.table);
    const current = await readConstraintState(db, entity.table, constraint);
    if (current && !hasExpectedNotNullConstraintDefinition(current, entity.table)) {
      throw new Error(`Public ID check has an unexpected definition: ${constraint}.`);
    }
    if (!current) {
      await db.query(
        `ALTER TABLE ${quotedIdentifier(entity.table)}
           ADD CONSTRAINT ${quotedIdentifier(constraint)} CHECK ("publicId" IS NOT NULL) NOT VALID`,
      );
    }
    if (!current?.validated) {
      await db.query(
        `ALTER TABLE ${quotedIdentifier(entity.table)}
           VALIDATE CONSTRAINT ${quotedIdentifier(constraint)}`,
      );
    }
  }
}

export async function ensurePublicIdFormatChecks(db: PublicIdMigrationDatabase) {
  for (const entity of publicIdContractEntities) {
    const constraint = publicIdFormatConstraintName(entity.table);
    const current = await readConstraintState(db, entity.table, constraint);
    if (current && !hasExpectedFormatConstraintDefinition(current, entity.table, entity.prefix)) {
      throw new Error(`Public ID format check has an unexpected definition: ${constraint}.`);
    }
    if (!current) {
      await db.query(
        `ALTER TABLE ${quotedIdentifier(entity.table)}
           ADD CONSTRAINT ${quotedIdentifier(constraint)}
           CHECK ("publicId" ~ '${publicIdFormatPattern(entity.prefix)}') NOT VALID`,
      );
    }
    if (!current?.validated) {
      await db.query(
        `ALTER TABLE ${quotedIdentifier(entity.table)}
           VALIDATE CONSTRAINT ${quotedIdentifier(constraint)}`,
      );
    }
  }
}

export async function assertPublicIdContractPrepared(db: PublicIdMigrationDatabase) {
  const status = await assertPublicIdContractPreconditions(db);
  for (const table of highVolumePublicIdTables) {
    const name = publicIdIndexName(table);
    const index = await readIndexState(db, name);
    if (!index?.valid || !hasExpectedIndexDefinition(index, table)) {
      throw new Error(`Public ID index is not valid and unique: ${table}.`);
    }
  }
  for (const entity of publicIdContractEntities) {
    const constraint = await readConstraintState(
      db,
      entity.table,
      publicIdNotNullConstraintName(entity.table),
    );
    if (
      !constraint?.validated ||
      !hasExpectedNotNullConstraintDefinition(constraint, entity.table)
    ) {
      throw new Error(`Public ID not-null check is not validated: ${entity.table}.`);
    }
    const formatConstraint = await readConstraintState(
      db,
      entity.table,
      publicIdFormatConstraintName(entity.table),
    );
    if (
      !formatConstraint?.validated ||
      !hasExpectedFormatConstraintDefinition(formatConstraint, entity.table, entity.prefix)
    ) {
      throw new Error(`Public ID format check is not validated: ${entity.table}.`);
    }
  }
  return status;
}

export async function preparePublicIdContract(db: PublicIdMigrationDatabase) {
  const previousLockTimeout = await readLockTimeout(db);
  await setLockTimeout(db, PUBLIC_ID_PREPARE_LOCK_TIMEOUT);
  try {
    await assertPublicIdContractPreconditions(db);
    await ensureHighVolumePublicIdIndexes(db);
    await ensurePublicIdFormatChecks(db);
    await ensurePublicIdNotNullChecks(db);
    return await assertPublicIdContractPrepared(db);
  } finally {
    await setLockTimeout(db, previousLockTimeout);
  }
}
