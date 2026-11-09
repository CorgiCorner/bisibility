import { isDeepStrictEqual } from "node:util";

export async function verifyAdminIndexes(client, schema) {
  const definitions = [
    {
      name: "sessions_admin_last_active_idx",
      table: "sessions",
      columns: ["userId", "updatedAt"],
      directions: [0, 3],
    },
    {
      name: "users_admin_created_sort_idx",
      table: "users",
      columns: ["createdAt", "publicId"],
      directions: [0, 0],
    },
  ];
  for (const definition of definitions) {
    const expected = {
      ...definition,
      schema,
      unique: false,
      valid: true,
      ready: true,
      method: "btree",
      keyCount: 2,
      attributeCount: 2,
      expressions: false,
      partial: false,
    };
    const { rows } = await client.query(
      `
      SELECT idx.relname AS name, t.relname AS "table", ns.nspname AS "schema",
        i.indisunique AS "unique", i.indisvalid AS valid, i.indisready AS ready,
        am.amname AS method, i.indnkeyatts::int AS "keyCount", i.indnatts::int AS "attributeCount",
        i.indexprs IS NOT NULL AS expressions, i.indpred IS NOT NULL AS partial,
        i.indoption::smallint[] AS directions,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(id, ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.id
          ORDER BY k.ord) AS columns
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
      JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
      JOIN pg_catalog.pg_am am ON am.oid=idx.relam
      WHERE ns.nspname=$1 AND t.relname=$2 AND idx.relname=$3`,
      [schema, definition.table, definition.name],
    );
    if (!isDeepStrictEqual(rows, [expected]))
      throw new Error("SQL-owned admin index does not match its migration contract.");
  }
  return definitions.map(({ name }) => name);
}
