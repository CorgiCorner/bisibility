import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { publicIdContractEntities } from "./definition";
import { readPublicIdContractReadiness } from "./readiness";

const N1_PHASE = "public-id-v3-n1";
const APP_RELEASE = /^[0-9a-f]{40}$/;
const historicalCutover = dataMigrationManifest.find(
  ({ id }) => id === "20260729213000_public_id_v3_cutover",
);

type CleanupPolicy = "automatic" | "operator";

function quotedIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function finalContractReady(db: PublicIdMigrationDatabase) {
  return readPublicIdContractReadiness({
    $queryRawUnsafe: async <T>(query: string) => {
      const result = await db.query(query);
      return result.rows as T;
    },
  });
}

async function gateInstalled(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT to_regclass(
       format('%I.public_id_v3_write_gate', current_schema())
     ) IS NOT NULL AS "installed"`,
  );
  return result.rows[0]?.installed === true;
}

async function protectedTables(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT table_meta.schemaname AS "schema", table_meta.tablename AS "table"
       FROM pg_catalog.pg_tables AS table_meta
      WHERE table_meta.schemaname = current_schema()
        AND table_meta.tablename NOT IN (
          '_prisma_migrations',
          'data_migrations',
          'public_id_v3_write_gate'
        )
      ORDER BY table_meta.tablename`,
  );
  return result.rows.map((row) => ({
    schema: String(row.schema),
    table: String(row.table),
  }));
}

async function assertHistoricalCutover(db: PublicIdMigrationDatabase) {
  if (!historicalCutover) {
    throw new Error("Historical public ID v3 cutover metadata is missing.");
  }
  const result = await db.query(
    `SELECT "checksum", "finishedAt"
       FROM "data_migrations"
      WHERE "id" = $1`,
    [historicalCutover.id],
  );
  const row = result.rows[0];
  if (row?.finishedAt != null && row.checksum === historicalCutover.checksum) return;

  const count = await db.query(
    `SELECT (${publicIdContractEntities
      .map(({ table }) => `(SELECT COUNT(*) FROM ${quotedIdentifier(table)})`)
      .join(" + ")})::bigint AS "count"`,
  );
  if (BigInt(String(count.rows[0]?.count ?? "-1")) === 0n) return;
  throw new Error("Historical public ID v3 cutover audit is incomplete or mismatched.");
}

async function assertReservationLedger(db: PublicIdMigrationDatabase) {
  const incomplete = await db.query(
    `SELECT COUNT(*)::int AS "count"
       FROM "public_id_v3_migrations"
      WHERE "migratedAt" IS NULL`,
  );
  if (Number(incomplete.rows[0]?.count ?? -1) !== 0) {
    throw new Error("Public ID v3 reservation ledger contains incomplete entries.");
  }
  for (const entity of publicIdContractEntities) {
    const mismatches = await db.query(
      `SELECT COUNT(*)::int AS "count"
         FROM "public_id_v3_migrations" AS "migration"
         JOIN ${quotedIdentifier(entity.table)} AS "row"
           ON "row"."id" = "migration"."internalId"
        WHERE "migration"."entityType" = $1
          AND "migration"."newPublicId" IS DISTINCT FROM "row"."publicId"`,
      [entity.entityType],
    );
    if (Number(mismatches.rows[0]?.count ?? -1) !== 0) {
      throw new Error(`Public ID v3 reservation ledger does not match ${entity.entityType}.`);
    }
  }
}

async function assertTriggerInventory(
  db: PublicIdMigrationDatabase,
  tables: readonly { schema: string; table: string }[],
) {
  const result = await db.query(
    `SELECT namespace_meta.nspname AS "schema",
            table_meta.relname AS "table",
            trigger_meta.tgtype::int AS "type",
            trigger_meta.tgfoid = to_regprocedure(
              format('%I.enforce_public_id_v3_write_gate()', current_schema())
            ) AS "functionMatches"
       FROM pg_catalog.pg_trigger AS trigger_meta
       JOIN pg_catalog.pg_class AS table_meta
         ON table_meta.oid = trigger_meta.tgrelid
       JOIN pg_catalog.pg_namespace AS namespace_meta
         ON namespace_meta.oid = table_meta.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND NOT trigger_meta.tgisinternal
        AND trigger_meta.tgname = 'public_id_v3_write_gate'
      ORDER BY table_meta.relname`,
  );
  if (result.rows.length !== tables.length) {
    throw new Error("Public ID v3 write gate trigger inventory is incomplete.");
  }
  for (const [index, table] of tables.entries()) {
    const trigger = result.rows[index];
    if (
      trigger?.schema !== table.schema ||
      trigger.table !== table.table ||
      Number(trigger.type) !== 62 ||
      trigger.functionMatches !== true
    ) {
      throw new Error("Public ID v3 write gate trigger inventory is inconsistent.");
    }
  }
}

export async function cleanupPublicIdV3N1Artifacts(
  db: PublicIdMigrationDatabase,
  expectedAppRelease: string,
  expectedPolicy: CleanupPolicy,
) {
  if (!APP_RELEASE.test(expectedAppRelease)) {
    throw new Error("Public ID v3 cleanup requires an exact lowercase commit SHA.");
  }
  if (!(await gateInstalled(db))) {
    if (await finalContractReady(db)) {
      return { alreadyClean: true, cleaned: false };
    }
    throw new Error("Public ID v3 cleanup found missing or partial lifecycle artifacts.");
  }

  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL lock_timeout = '30s'`);
    const gate = await db.query(
      `SELECT "phase",
              "releasePolicy",
              "targetAppRelease",
              "writesBlocked" AS "blocked",
              "releasedAt",
              "releasedAppRelease"
         FROM "public_id_v3_write_gate"
        WHERE "id" IS TRUE
        FOR UPDATE`,
    );
    const state = gate.rows[0];
    if (
      gate.rows.length !== 1 ||
      state?.phase !== N1_PHASE ||
      state.releasePolicy !== expectedPolicy ||
      state.targetAppRelease !== expectedAppRelease ||
      state.blocked !== true ||
      state.releasedAt != null ||
      state.releasedAppRelease != null
    ) {
      throw new Error("Public ID v3 N+1 cleanup gate does not match the verified release.");
    }

    const tables = await protectedTables(db);
    for (const table of tables) {
      await db.query(
        `LOCK TABLE ${quotedIdentifier(table.schema)}.${quotedIdentifier(
          table.table,
        )} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    await db.query(`LOCK TABLE "data_migrations" IN SHARE ROW EXCLUSIVE MODE`);

    if (!(await finalContractReady(db))) {
      throw new Error("Public ID v3 final catalog or lifecycle artifacts are incomplete.");
    }
    await assertHistoricalCutover(db);
    await assertReservationLedger(db);
    await assertTriggerInventory(db, tables);

    for (const table of tables) {
      await db.query(
        `DROP TRIGGER "public_id_v3_write_gate" ON ${quotedIdentifier(
          table.schema,
        )}.${quotedIdentifier(table.table)}`,
      );
    }
    await db.query(
      `DROP FUNCTION ${quotedIdentifier(
        tables[0]?.schema ?? "public",
      )}."enforce_public_id_v3_write_gate"()`,
    );
    await db.query(`DROP TABLE "public_id_v3_migrations"`);
    await db.query(`DROP TABLE "public_id_v3_write_gate"`);

    if (!(await finalContractReady(db))) {
      throw new Error("Public ID v3 cleanup postconditions failed.");
    }
    await db.query("COMMIT");
    return { alreadyClean: false, cleaned: true };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
