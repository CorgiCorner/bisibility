import { migratePublicIds } from "@/lib/public-id-migrator/runner";
import type {
  PublicIdMigrationDatabase,
  PublicIdMigrationOptions,
} from "@/lib/public-id-migrator/types";
import { preparePublicIdContract } from "./prepare";
import { withPublicIdV3CutoverBypass } from "./write-gate";

const PREPARE_LOCK = "bisibility-public-id-v3-contract-prepare";

type UpgradeOptions = Pick<PublicIdMigrationOptions, "batchSize" | "makeId">;

async function acquirePrepareLock(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT pg_try_advisory_lock(
       hashtext($1 || ':' || current_schema())
     ) AS "locked"`,
    [PREPARE_LOCK],
  );
  if (result.rows[0]?.locked !== true) {
    throw new Error("Another public ID contract preparation is already running.");
  }
}

async function releasePrepareLock(db: PublicIdMigrationDatabase) {
  await db.query(
    `SELECT pg_advisory_unlock(
       hashtext($1 || ':' || current_schema())
     )`,
    [PREPARE_LOCK],
  );
}

export async function runPublicIdContractPrepare(
  db: PublicIdMigrationDatabase,
  options: UpgradeOptions,
) {
  await acquirePrepareLock(db);
  try {
    return await withPublicIdV3CutoverBypass(db, async () => {
      const migration = await migratePublicIds(db, options);
      const status = await preparePublicIdContract(db);
      return { migration, status };
    });
  } finally {
    await releasePrepareLock(db);
  }
}
