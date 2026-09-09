import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260905210000_keyword_group_normalization/migration.sql",
);

export async function applyTemporaryKeywordNormalizationMigration(client: Client) {
  const relation = await client.query<{ temporary: boolean }>(
    "SELECT relpersistence = 't' AS temporary FROM pg_class WHERE oid = 'keywords'::regclass",
  );
  if (relation.rows[0]?.temporary !== true) {
    throw new Error(
      "The keyword normalization migration can run only on a temporary keywords table.",
    );
  }

  await client.query(await readFile(migrationPath, "utf8"));
}
