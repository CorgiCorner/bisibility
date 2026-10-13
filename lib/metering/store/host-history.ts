import {
  type HistoricalEvidenceInput,
  type HistoricalEvidenceResult,
  importHistoricalEvidence as immutableImport,
} from "./history";
import { createSql, type Prisma, type Sql } from "./host-sql";

export type { HistoricalEvidenceInput, HistoricalEvidenceResult } from "./history";

/** Active runtime import: real history audit and writer fence precede every mutation. */
export async function importHistoricalEvidence(
  client: Sql | Prisma.TransactionClient,
  input: HistoricalEvidenceInput,
): Promise<HistoricalEvidenceResult> {
  const sql =
    "query" in client ? client : createSql(client, { statements: 0, changes: 0n, rowsRead: 0 });
  await sql.adoptTimestampContract();
  return immutableImport(sql, input);
}
