import {
  runHistoricalImport as immutableImport,
  verifyHistoricalImport as immutableVerify,
} from "./history-migration";
import type { Sql } from "./store/host-sql";

export { historyMigrationId } from "./history-migration";

/** The legacy pre-DDL implementation remains byte-pinned; active host entry points require adoption. */
export async function runHistoricalImport(sql: Sql, namespace: string, batchSize: number) {
  await sql.adoptTimestampContract();
  return immutableImport(sql, namespace, batchSize);
}

/** Read-only verification never bootstraps a timestamp marker. */
export async function verifyHistoricalImport(sql: Sql) {
  await sql.verifyTimestampContract();
  return immutableVerify(sql);
}
