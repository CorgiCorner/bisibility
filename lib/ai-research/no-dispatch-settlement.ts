import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { cancelUnsentPaidAttempt } from "@/lib/metering/cancel-paid-attempt";
import { readCanonicalUsage } from "@/lib/metering/usage-read";

type Scope = { projectId: string; connectionId: string; tags: string[] };
export async function settleNoDispatchInTransaction(tx: Prisma.TransactionClient, scope: Scope) {
  if (!scope.tags.length) return [];
  const rows = await readCanonicalUsage(
    Prisma.sql`"projectId"=${scope.projectId} AND "connectionId"=${scope.connectionId} AND provider='dataforseo' AND feature='prompt_explorer' AND "credentialSource"='own' AND tag IN (${Prisma.join(scope.tags)})`,
    tx,
    true,
  );
  for (const row of rows)
    await cancelUnsentPaidAttempt(tx, {
      namespace: row.namespace,
      principal: row.principal,
      operationId: row.id,
    });
  return rows.map((row) => row.id);
}
export async function settleNoDispatch(scope: Scope) {
  await prisma.$transaction((tx) => settleNoDispatchInTransaction(tx, scope));
}
export async function settleLateNoDispatch(
  tx: Prisma.TransactionClient,
  projectId: string,
  connectionId: string,
) {
  const rows = await readCanonicalUsage(
    Prisma.sql`"projectId"=${projectId} AND "connectionId"=${connectionId} AND feature='prompt_explorer' AND "measurementStatus"='unknown' AND tag IS NOT NULL`,
    tx,
    true,
  );
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.tag) continue;
    const proof = await tx.agentReport.findFirst({
      where: {
        projectId,
        kind: "prompt_explorer",
        AND: [
          { provenance: { path: ["costPolicy"], equals: "provider_actual_cost" } },
          { provenance: { path: ["actualCostState"], equals: "refused" } },
          { provenance: { path: ["connectionId"], equals: connectionId } },
          { provenance: { path: ["noDispatchTags"], array_contains: [row.tag] } },
        ],
      },
      select: { id: true },
    });
    if (proof)
      ids.push(
        ...(await settleNoDispatchInTransaction(tx, { projectId, connectionId, tags: [row.tag] })),
      );
  }
  return ids;
}
