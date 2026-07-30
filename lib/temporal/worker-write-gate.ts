import { prisma } from "@/lib/db/prisma";
import { readPublicIdV3WriteGate } from "@/lib/public-id-contract/write-gate";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";

type WorkerWriteGateDatabase = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

function publicIdMigrationDatabase(db: WorkerWriteGateDatabase): PublicIdMigrationDatabase {
  return {
    async query(sql, values = []) {
      const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...values);
      return { rows };
    },
  };
}

export async function assertPublicIdV3WriteGateAllowsWorkerStartup(
  db: WorkerWriteGateDatabase = prisma,
) {
  const gate = await readPublicIdV3WriteGate(publicIdMigrationDatabase(db));
  if (gate.installed && gate.blocked) {
    throw new Error(
      "Public ID v3 write gate is active; release it before starting the Temporal worker.",
    );
  }
  return gate;
}
