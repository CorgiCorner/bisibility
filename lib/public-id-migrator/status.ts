import { publicIdEntityDefinitions } from "./entities.ts";
import type { PublicIdMigrationDatabase } from "./types.ts";

export async function publicIdMigrationStatus(db: PublicIdMigrationDatabase) {
  const status = [];
  for (const entity of publicIdEntityDefinitions) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS "total",
                COUNT(*) FILTER (WHERE "publicId" IS NULL)::int AS "missing",
                COUNT(*) FILTER (WHERE "publicId" ~ $2)::int AS "strict",
                COUNT(*) FILTER (WHERE "publicId" IS NOT NULL AND "publicId" !~ $2)::int AS "invalid",
                COUNT("migration"."id") FILTER (WHERE "migration"."migratedAt" IS NOT NULL)::int AS "ledgerMigrated"
         FROM "${entity.table}" AS "row"
         LEFT JOIN "public_id_v3_migrations" AS "migration"
           ON "migration"."entityType" = $1 AND "migration"."internalId" = "row"."id"`,
      [entity.entityType, `^${entity.prefix}_[a-z][a-z0-9]{23}$`],
    );
    status.push({
      entityType: entity.entityType,
      invalid: Number(result.rows[0]?.invalid ?? 0),
      ledgerMigrated: Number(result.rows[0]?.ledgerMigrated ?? 0),
      missing: Number(result.rows[0]?.missing ?? 0),
      strict: Number(result.rows[0]?.strict ?? 0),
      total: Number(result.rows[0]?.total ?? 0),
    });
  }
  return status;
}
