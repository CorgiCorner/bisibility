import "server-only";
import { prisma } from "@/lib/db/prisma";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { localHostItemReadSchema, localHostRunReadSchema } from "./read-schema";
import { readLocalHostRunInTransaction } from "./read-transaction";

/** One complete bounded admitted taskset; provider IDs, native amounts and credential custody stay internal. */
export async function readLocalHostRun(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const data = localHostRunReadSchema.parse(command);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, data.projectId, "read");
    return readLocalHostRunInTransaction(tx, data, scope);
  });
}
export async function readLocalHostItem(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const { targetId, ...run } = localHostItemReadSchema.parse(command);
  const result = await readLocalHostRun(run, context, db);
  const item = result.items.find((row) => row.targetId === targetId);
  if (!item) throw new LocalMeasurementUnavailableError();
  return { runId: result.id, runVersion: result.version, ...item };
}
