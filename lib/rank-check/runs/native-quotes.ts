import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadNativeRankRequestCosts } from "@/lib/provider-rates/native-rank-request";
import { estimateRunRows } from "./launch-preflight";

/** Launch repeats this read under its source lock before checking the signed preview. */
export async function quoteRunRows(
  rows: Parameters<typeof estimateRunRows>[0],
  projectDepth: Parameters<typeof estimateRunRows>[1],
  input: Parameters<typeof estimateRunRows>[2],
  connection: Parameters<typeof estimateRunRows>[3],
  db: Prisma.TransactionClient = prisma,
) {
  const draft = await estimateRunRows(rows, projectDepth, input, connection);
  const costs = await loadNativeRankRequestCosts(
    db,
    { ...connection, credentialsEncrypted: connection.credentialsEncrypted ?? null },
    draft.targets.map((target, index) => ({
      depth: target.depth,
      keyword: rows[index].text,
    })),
  );
  return costs ? await estimateRunRows(rows, projectDepth, input, connection, costs) : draft;
}
