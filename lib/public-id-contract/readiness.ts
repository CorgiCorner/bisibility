import { publicIdContractEntities } from "./definition";

type ContractReadinessDatabase = {
  $queryRawUnsafe<T>(query: string): Promise<T>;
};

const requiredEntities = publicIdContractEntities
  .map(({ prefix, table }) => `('${table}', '${prefix}')`)
  .join(",\n        ");

const finalContractReadinessQuery = `
  WITH required(table_name, prefix) AS (
    VALUES
        ${requiredEntities}
  ), contract_columns AS (
    SELECT required.table_name,
           required.prefix,
           table_class.oid AS table_oid,
           column_meta.attnotnull AS public_id_not_null
      FROM required
      LEFT JOIN pg_catalog.pg_namespace AS namespace_meta
        ON namespace_meta.nspname = current_schema()
      LEFT JOIN pg_catalog.pg_class AS table_class
        ON table_class.relnamespace = namespace_meta.oid
       AND table_class.relname = required.table_name
       AND table_class.relkind = 'r'
      LEFT JOIN pg_catalog.pg_attribute AS column_meta
        ON column_meta.attrelid = table_class.oid
       AND column_meta.attname = 'publicId'
       AND column_meta.attnum > 0
       AND NOT column_meta.attisdropped
  )
  SELECT COALESCE(BOOL_AND(
    table_oid IS NOT NULL
    AND public_id_not_null IS TRUE
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_index AS index_meta
        JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_meta.indexrelid
        JOIN pg_catalog.pg_namespace AS index_namespace
          ON index_namespace.oid = index_class.relnamespace
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
       WHERE index_namespace.nspname = current_schema()
         AND index_meta.indrelid = contract_columns.table_oid
         AND index_class.relname = contract_columns.table_name || '_publicId_key'
         AND index_meta.indisvalid
         AND index_meta.indisunique
         AND access_method.amname = 'btree'
         AND index_meta.indpred IS NULL
         AND index_meta.indexprs IS NULL
         AND index_meta.indnkeyatts = 1
         AND index_meta.indnatts = 1
         AND ARRAY(
           SELECT attribute_meta.attname::text
             FROM unnest(index_meta.indkey::smallint[]) WITH ORDINALITY
               AS key_meta(attnum, ordinality)
             JOIN pg_catalog.pg_attribute AS attribute_meta
               ON attribute_meta.attrelid = index_meta.indrelid
              AND attribute_meta.attnum = key_meta.attnum
            WHERE key_meta.ordinality <= index_meta.indnkeyatts
            ORDER BY key_meta.ordinality
         ) = ARRAY['publicId']::text[]
    )
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_meta
       WHERE constraint_meta.conrelid = contract_columns.table_oid
         AND constraint_meta.conname = contract_columns.table_name || '_public_id_contract_format'
         AND constraint_meta.contype = 'c'
         AND constraint_meta.convalidated
         AND pg_catalog.pg_get_constraintdef(constraint_meta.oid, false)
             = format(
                 'CHECK (("publicId" ~ %L::text))',
                 '^' || contract_columns.prefix || '_[a-z][a-z0-9]{23}$'
               )
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_meta
       WHERE constraint_meta.conrelid = contract_columns.table_oid
         AND constraint_meta.conname =
             contract_columns.table_name || '_public_id_contract_not_null'
    )
  ), FALSE) AS "ready"
    FROM contract_columns;
`;

export async function readPublicIdContractReadiness(
  db: ContractReadinessDatabase,
): Promise<boolean> {
  const [result] = await db.$queryRawUnsafe<{ ready: boolean }[]>(finalContractReadinessQuery);
  if (result?.ready !== true) return false;

  const [artifacts] = await db.$queryRawUnsafe<
    {
      functionInstalled: boolean;
      gateInstalled: boolean;
      ledgerInstalled: boolean;
      triggerCount: number;
    }[]
  >(
    `SELECT
       to_regclass(format('%I.public_id_v3_write_gate', current_schema())) IS NOT NULL
         AS "gateInstalled",
       to_regclass(format('%I.public_id_v3_migrations', current_schema())) IS NOT NULL
         AS "ledgerInstalled",
       to_regprocedure(
         format('%I.enforce_public_id_v3_write_gate()', current_schema())
       ) IS NOT NULL AS "functionInstalled",
       (
         SELECT COUNT(*)::int
           FROM pg_catalog.pg_trigger AS trigger_meta
           JOIN pg_catalog.pg_class AS table_meta
             ON table_meta.oid = trigger_meta.tgrelid
           JOIN pg_catalog.pg_namespace AS namespace_meta
             ON namespace_meta.oid = table_meta.relnamespace
          WHERE namespace_meta.nspname = current_schema()
            AND NOT trigger_meta.tgisinternal
            AND trigger_meta.tgname = 'public_id_v3_write_gate'
       ) AS "triggerCount"`,
  );
  if (!artifacts) return false;
  const allAbsent =
    !artifacts.gateInstalled &&
    !artifacts.ledgerInstalled &&
    !artifacts.functionInstalled &&
    artifacts.triggerCount === 0;
  if (allAbsent) return true;
  if (!artifacts.gateInstalled || !artifacts.ledgerInstalled || !artifacts.functionInstalled) {
    return false;
  }

  const [installed] = await db.$queryRawUnsafe<{ ready: boolean }[]>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM "public_id_v3_write_gate"
          WHERE "id" IS TRUE
            AND "phase" = 'public-id-v3-n1'
            AND "writesBlocked" IS TRUE
            AND "releasedAt" IS NULL
            AND "releasedAppRelease" IS NULL
       )
       AND NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_tables AS table_meta
          WHERE table_meta.schemaname = current_schema()
            AND table_meta.tablename NOT IN (
              '_prisma_migrations',
              'data_migrations',
              'public_id_v3_write_gate'
            )
            AND NOT EXISTS (
              SELECT 1
                FROM pg_catalog.pg_trigger AS trigger_meta
                JOIN pg_catalog.pg_class AS trigger_table
                  ON trigger_table.oid = trigger_meta.tgrelid
                JOIN pg_catalog.pg_namespace AS trigger_namespace
                  ON trigger_namespace.oid = trigger_table.relnamespace
               WHERE trigger_namespace.nspname = current_schema()
                 AND trigger_table.relname = table_meta.tablename
                 AND NOT trigger_meta.tgisinternal
                 AND trigger_meta.tgname = 'public_id_v3_write_gate'
                 AND trigger_meta.tgtype = 62
                 AND trigger_meta.tgfoid = to_regprocedure(
                   format(
                     '%I.enforce_public_id_v3_write_gate()',
                     current_schema()
                   )
                 )
            )
       )
       AND (
         SELECT COUNT(*)::int
           FROM pg_catalog.pg_trigger AS trigger_meta
           JOIN pg_catalog.pg_class AS table_meta
             ON table_meta.oid = trigger_meta.tgrelid
           JOIN pg_catalog.pg_namespace AS namespace_meta
             ON namespace_meta.oid = table_meta.relnamespace
          WHERE namespace_meta.nspname = current_schema()
            AND NOT trigger_meta.tgisinternal
            AND trigger_meta.tgname = 'public_id_v3_write_gate'
       ) = (
         SELECT COUNT(*)::int
           FROM pg_catalog.pg_tables AS table_meta
          WHERE table_meta.schemaname = current_schema()
            AND table_meta.tablename NOT IN (
              '_prisma_migrations',
              'data_migrations',
              'public_id_v3_write_gate'
            )
       ) AS "ready"`,
  );
  return installed?.ready === true;
}

export { finalContractReadinessQuery };
