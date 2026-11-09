import { verifyAdminIndexes } from "../../lib/db/migration-index-contract.mjs";

export async function verifyAdditionalMigrationConstraints(client, schema) {
  const indexes = await verifyAdminIndexes(client, schema);
  return indexes.map((name) => `-- DropIndex\nDROP INDEX "${name}";`).join("\n\n");
}
